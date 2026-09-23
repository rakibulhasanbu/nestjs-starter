import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import ms from "ms";
import { randomUUID } from "node:crypto";
import { generateOpaqueToken, hashToken } from "@/common/utils/token.util.js";
import type { DeviceInfo } from "@/common/utils/device.util.js";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";

/**
 * Deliberately carries no roles or permissions — only identity plus two version
 * markers the guard re-validates on every request. Authorization data baked into
 * a token cannot be revoked before it expires; a version number can.
 */
export interface AccessTokenPayload {
    sub: string;
    email: string;
    /** Snapshot of User.permVersion at issue time. Stale value ⇒ the user's access changed. */
    permVersion: number;
    /** Snapshot of User.tokenVersion at issue time. Stale value ⇒ the session was killed. */
    tokenVersion: number;
}

export interface IssuedTokenPair {
    accessToken: string;
    refreshToken: string;
}

export interface IssuedRefreshToken {
    token: string;
    /** Pass back into issueRefreshToken on the next rotation to keep the chain intact. */
    familyId: string;
}

/**
 * Outcome of presenting a refresh token.
 *
 * `reused` is the interesting one: the token was real but had already been
 * rotated away. Either it leaked or a client replayed it, and neither case can
 * be told apart from the other — so the whole rotation chain is dropped.
 */
export type RefreshTokenConsumption =
    | { outcome: "valid"; record: RefreshTokenWithUser }
    | { outcome: "reused"; userId: string }
    | { outcome: "invalid" };

type RefreshTokenWithUser = Awaited<ReturnType<PrismaService["refreshToken"]["findUniqueOrThrow"]>> & {
    user: Awaited<ReturnType<PrismaService["user"]["findUniqueOrThrow"]>>;
};

@Injectable()
export class TokensService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService<Env, true>,
        private readonly prisma: PrismaService,
    ) {}

    signAccessToken(payload: AccessTokenPayload): string {
        return this.jwtService.sign(payload, {
            secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
            expiresIn: this.configService.get("JWT_ACCESS_TTL", { infer: true }),
        });
    }

    /** Omitting `familyId` starts a new chain — i.e. a fresh login rather than a rotation. */
    async issueRefreshToken(
        userId: string,
        context: { userAgent?: string; ipAddress?: string; device: DeviceInfo },
        familyId?: string,
    ): Promise<IssuedRefreshToken> {
        const { token, tokenHash } = generateOpaqueToken();
        const ttlMs = ms(this.configService.get("JWT_REFRESH_TTL", { infer: true }) as ms.StringValue);
        const family = familyId ?? randomUUID();

        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash,
                familyId: family,
                userAgent: context.userAgent,
                ipAddress: context.ipAddress,
                deviceType: context.device.deviceType,
                deviceName: context.device.deviceName,
                expiresAt: new Date(Date.now() + ttlMs),
            },
        });

        return { token, familyId: family };
    }

    /**
     * Validates a refresh token and revokes it — call issueRefreshToken again with
     * the returned familyId to rotate.
     *
     * Rotation alone is not enough to make a stolen token harmless: whoever
     * refreshes second simply fails, which means a thief who gets there first
     * silently takes over the session and the real user is the one logged out.
     * Recognising the already-spent token is what turns that round the right way.
     */
    async consumeRefreshToken(rawToken: string): Promise<RefreshTokenConsumption> {
        const tokenHash = hashToken(rawToken);

        const record = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!record) {
            return { outcome: "invalid" };
        }

        if (record.revokedAt) {
            await this.revokeFamily(record.familyId);
            return { outcome: "reused", userId: record.userId };
        }

        if (record.expiresAt < new Date()) {
            return { outcome: "invalid" };
        }

        // Claim the token atomically. Losing this race means a concurrent request
        // just spent it — a client double-tapping refresh, not a leak, so the
        // family is left alone.
        const { count } = await this.prisma.refreshToken.updateMany({
            where: { id: record.id, revokedAt: null },
            data: { revokedAt: new Date(), lastUsedAt: new Date() },
        });

        return count === 0 ? { outcome: "invalid" } : { outcome: "valid", record };
    }

    /** Drops an entire rotation chain — every token descended from one login. */
    async revokeFamily(familyId: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: { familyId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async revokeRefreshToken(rawToken: string): Promise<void> {
        const tokenHash = hashToken(rawToken);
        await this.prisma.refreshToken.updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async revokeAllRefreshTokens(userId: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    listActiveSessions(userId: string) {
        return this.prisma.refreshToken.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { lastUsedAt: "desc" },
        });
    }

    async revokeSessionById(userId: string, sessionId: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: { id: sessionId, userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    /** Short-lived token proving a password check passed, so a 2FA code can be requested next without re-authenticating. */
    signTwoFactorToken(userId: string): string {
        return this.jwtService.sign(
            { sub: userId, purpose: "2fa" },
            {
                secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
                expiresIn: this.configService.get("TWO_FACTOR_LOGIN_TTL", { infer: true }),
            },
        );
    }

    /** Removes spent and long-expired rows; returns how many were deleted. */
    async purgeExpired(revokedRetentionDays: number): Promise<number> {
        const revokedCutoff = new Date(Date.now() - revokedRetentionDays * 24 * 60 * 60 * 1000);

        const { count } = await this.prisma.refreshToken.deleteMany({
            where: {
                OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: revokedCutoff } }],
            },
        });

        return count;
    }

    verifyTwoFactorToken(token: string): string {
        try {
            const payload = this.jwtService.verify<{ sub: string; purpose: string }>(token, {
                secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
            });
            if (payload.purpose !== "2fa") {
                throw new UnauthorizedException("Invalid two-factor token");
            }
            return payload.sub;
        } catch {
            throw new UnauthorizedException("Invalid or expired two-factor token");
        }
    }
}
