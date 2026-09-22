import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import ms from "ms";
import { generateOpaqueToken, hashToken } from "@/common/utils/token.util.js";
import type { DeviceInfo } from "@/common/utils/device.util.js";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";
import type { Role } from "@/database/generated/prisma/enums.js";

export interface AccessTokenPayload {
    sub: string;
    email: string;
    role: Role;
}

export interface IssuedTokenPair {
    accessToken: string;
    refreshToken: string;
}

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

    async issueRefreshToken(
        userId: string,
        context: { userAgent?: string; ipAddress?: string; device: DeviceInfo },
    ): Promise<string> {
        const { token, tokenHash } = generateOpaqueToken();
        const ttlMs = ms(this.configService.get("JWT_REFRESH_TTL", { infer: true }) as ms.StringValue);

        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash,
                userAgent: context.userAgent,
                ipAddress: context.ipAddress,
                deviceType: context.device.deviceType,
                deviceName: context.device.deviceName,
                expiresAt: new Date(Date.now() + ttlMs),
            },
        });

        return token;
    }

    /** Validates a refresh token and revokes it — call issueRefreshToken again to rotate. */
    async consumeRefreshToken(rawToken: string) {
        const tokenHash = hashToken(rawToken);

        const record = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!record || record.revokedAt || record.expiresAt < new Date()) {
            return null;
        }

        await this.prisma.refreshToken.update({
            where: { id: record.id },
            data: { revokedAt: new Date(), lastUsedAt: new Date() },
        });

        return record;
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
