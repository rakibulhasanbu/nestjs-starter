import { Injectable, Logger } from "@nestjs/common";
import type {
    AccountLinkedMessage,
    EmailSender,
    ResetPasswordMessage,
    VerifyEmailMessage,
} from "@/integrations/email/email-sender.interface.js";

/** Placeholder sender — logs instead of sending until a real provider is wired in. */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
    private readonly logger = new Logger(ConsoleEmailSender.name);

    async sendVerifyEmail(message: VerifyEmailMessage): Promise<void> {
        this.logger.log(`[verify-email] to=${message.to} url=${message.verificationUrl}`);
    }

    async sendResetPassword(message: ResetPasswordMessage): Promise<void> {
        this.logger.log(`[reset-password] to=${message.to} url=${message.resetUrl}`);
    }

    async sendAccountLinked(message: AccountLinkedMessage): Promise<void> {
        this.logger.log(`[account-linked] to=${message.to} provider=${message.provider}`);
    }
}
