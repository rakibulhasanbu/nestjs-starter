import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateOtpCode, hashToken } from "@/common/utils/token.util.js";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";
import { EmailTokenType } from "@/database/generated/prisma/enums.js";

const MAX_ATTEMPTS = 5;

@Injectable()
export class EmailTokensService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    async issueVerifyEmailToken(userId: string): Promise<string> {
        const ttlMinutes = this.configService.get("EMAIL_VERIFICATION_TTL_MINUTES", { infer: true });
        return this.issue(userId, EmailTokenType.VERIFY_EMAIL, ttlMinutes * 60 * 1000);
    }

    async issueResetPasswordToken(userId: string): Promise<string> {
        const ttlMinutes = this.configService.get("PASSWORD_RESET_TTL_MINUTES", { infer: true });
        return this.issue(userId, EmailTokenType.RESET_PASSWORD, ttlMinutes * 60 * 1000);
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

    private async issue(userId: string, type: EmailTokenType, ttlMs: number): Promise<string> {
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
