import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateOpaqueToken, hashToken } from "@/common/utils/token.util.js";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";
import { EmailTokenType } from "@/database/generated/prisma/enums.js";

@Injectable()
export class EmailTokensService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    async issueVerifyEmailToken(userId: string): Promise<string> {
        const ttlHours = this.configService.get("EMAIL_VERIFICATION_TTL_HOURS", { infer: true });
        return this.issue(userId, EmailTokenType.VERIFY_EMAIL, ttlHours * 60 * 60 * 1000);
    }

    async issueResetPasswordToken(userId: string): Promise<string> {
        const ttlMinutes = this.configService.get("PASSWORD_RESET_TTL_MINUTES", { infer: true });
        return this.issue(userId, EmailTokenType.RESET_PASSWORD, ttlMinutes * 60 * 1000);
    }

    /** Returns the associated userId if the token is valid, and marks it used. */
    async consume(rawToken: string, type: EmailTokenType): Promise<string | null> {
        const tokenHash = hashToken(rawToken);

        const record = await this.prisma.emailToken.findUnique({ where: { tokenHash } });

        if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
            return null;
        }

        await this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

        return record.userId;
    }

    private async issue(userId: string, type: EmailTokenType, ttlMs: number): Promise<string> {
        const { token, tokenHash } = generateOpaqueToken();

        await this.prisma.emailToken.create({
            data: { userId, type, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
        });

        return token;
    }
}
