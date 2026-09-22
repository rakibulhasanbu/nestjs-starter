import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { decrypt, encrypt } from "@/common/utils/encryption.util.js";
import { generateRecoveryCodes, hashToken } from "@/common/utils/token.util.js";
import type { Env } from "@/config/env.schema.js";
import { PrismaService } from "@/database/prisma.service.js";

@Injectable()
export class TwoFactorService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    /** Generates a new secret and stores it (disabled) until confirmed via enable(). */
    async setup(userId: string, email: string): Promise<{ otpauthUrl: string; qrCodeDataUrl: string }> {
        const secret = authenticator.generateSecret();
        const otpauthUrl = authenticator.keyuri(
            email,
            this.configService.get("TWO_FACTOR_APP_NAME", { infer: true }),
            secret,
        );

        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: encrypt(secret, this.getEncryptionKey()), twoFactorEnabled: false },
        });

        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
        return { otpauthUrl, qrCodeDataUrl };
    }

    /** Confirms the pending secret with a live code, turns 2FA on, and issues recovery codes (shown once). */
    async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (!user.twoFactorSecret) {
            throw new BadRequestException("Call the 2FA setup endpoint first");
        }

        const secret = decrypt(user.twoFactorSecret, this.getEncryptionKey());
        if (!authenticator.verify({ token: code, secret })) {
            throw new BadRequestException("Invalid authenticator code");
        }

        const recoveryCodes = generateRecoveryCodes();
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: true, twoFactorRecoveryCodes: recoveryCodes.map(hashToken) },
        });

        return { recoveryCodes };
    }

    async disable(userId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] },
        });
    }

    async verifyCode(userId: string, code: string): Promise<boolean> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (!user.twoFactorSecret) {
            return false;
        }
        const secret = decrypt(user.twoFactorSecret, this.getEncryptionKey());
        return authenticator.verify({ token: code, secret });
    }

    /** One-time use — the matched code is removed from the stored set on success. */
    async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        const hash = hashToken(code.toUpperCase());
        if (!user.twoFactorRecoveryCodes.includes(hash)) {
            return false;
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter((stored) => stored !== hash) },
        });

        return true;
    }

    private getEncryptionKey(): string {
        return this.configService.get("TWO_FACTOR_ENCRYPTION_KEY", { infer: true });
    }
}
