import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque tokens (email verification, password reset, refresh) are generated
 * here and only their SHA-256 hash is persisted, so a DB leak never exposes
 * usable tokens.
 */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("hex");
    return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
