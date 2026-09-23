export interface VerifyEmailMessage {
    to: string;
    code: string;
}

export interface ResetPasswordMessage {
    to: string;
    code: string;
}

export interface AccountLinkedMessage {
    to: string;
    provider: string;
}

export interface DeleteAccountCodeMessage {
    to: string;
    code: string;
}

/** Sent when someone tries to use an address whose account is inside its deletion grace period. */
export interface ReactivateAccountMessage {
    to: string;
    code: string;
    graceEndsAt: Date;
}

export interface AccountDeletedMessage {
    to: string;
    graceDays: number;
}

export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

/**
 * Port for outbound transactional email. Swap the stub implementation
 * (registered in EmailModule) for a real provider without touching callers.
 */
export interface EmailSender {
    sendVerifyEmail(message: VerifyEmailMessage): Promise<void>;
    sendResetPassword(message: ResetPasswordMessage): Promise<void>;
    sendAccountLinked(message: AccountLinkedMessage): Promise<void>;
    sendDeleteAccountCode(message: DeleteAccountCodeMessage): Promise<void>;
    sendAccountDeleted(message: AccountDeletedMessage): Promise<void>;
    sendReactivateAccount(message: ReactivateAccountMessage): Promise<void>;
}
