import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Opaque tokens (refresh tokens) are generated here and only their SHA-256
 * hash is persisted, so a DB leak never exposes usable tokens.
 */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("hex");
    return { token, tokenHash: hashToken(token) };
}

/** 6-digit OTP for email verification / password reset, meant for manual entry. */
export function generateOtpCode(): { code: string; codeHash: string } {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    return { code, codeHash: hashToken(code) };
}

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** One-time 2FA recovery codes, meant for the user to store offline. Only hashes are persisted. */
export function generateRecoveryCodes(count = 8): string[] {
    return Array.from({ length: count }, () => randomBytes(5).toString("hex").toUpperCase());
}
