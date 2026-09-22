import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateOtpCode, hashToken } from "@/common/utils/token.util.js";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";
import { EmailTokenType } from "@/database/generated/prisma/enums.js";

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class EmailTokensService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    /** Returns null (no code issued/sent) while a still-valid code is within its resend cooldown. */
    async issueVerifyEmailToken(userId: string): Promise<string | null> {
        const ttlMinutes = this.configService.get("EMAIL_VERIFICATION_TTL_MINUTES", { infer: true });
        return this.issue(userId, EmailTokenType.VERIFY_EMAIL, ttlMinutes * 60 * 1000);
    }

    /** Returns null (no code issued/sent) while a still-valid code is within its resend cooldown. */
    async issueResetPasswordToken(userId: string): Promise<string | null> {
        const ttlMinutes = this.configService.get("PASSWORD_RESET_TTL_MINUTES", { infer: true });
        return this.issue(userId, EmailTokenType.RESET_PASSWORD, ttlMinutes * 60 * 1000);
    }

    /** Returns null (no code issued/sent) while a still-valid code is within its resend cooldown. */
    async issueDeleteAccountToken(userId: string): Promise<string | null> {
        const ttlMinutes = this.configService.get("DELETE_ACCOUNT_OTP_TTL_MINUTES", { infer: true });
        return this.issue(userId, EmailTokenType.DELETE_ACCOUNT, ttlMinutes * 60 * 1000);
    }

    /** Checks the code for this user+type, tracks failed attempts, and marks it used on success. */
    async consume(userId: string, type: EmailTokenType, code: string): Promise<boolean> {
        const record = await this.prisma.emailToken.findUnique({ where: { userId_type: { userId, type } } });

        if (!record || record.usedAt || record.expiresAt < new Date() || record.attempts >= MAX_ATTEMPTS) {
            return false;
        }

        if (record.codeHash !== hashToken(code)) {
            await this.prisma.emailToken.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
            return false;
        }

        await this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

        return true;
    }

    private async issue(userId: string, type: EmailTokenType, ttlMs: number): Promise<string | null> {
        const existing = await this.prisma.emailToken.findUnique({ where: { userId_type: { userId, type } } });
        const isActiveAndFresh =
            existing &&
            !existing.usedAt &&
            existing.expiresAt > new Date() &&
            existing.createdAt.getTime() > Date.now() - RESEND_COOLDOWN_MS;
        if (isActiveAndFresh) {
            return null;
        }

        const { code, codeHash } = generateOtpCode();
        const expiresAt = new Date(Date.now() + ttlMs);

        await this.prisma.emailToken.upsert({
            where: { userId_type: { userId, type } },
            create: { userId, type, codeHash, expiresAt },
            update: { codeHash, expiresAt, usedAt: null, attempts: 0 },
        });

        return code;
    }
}
