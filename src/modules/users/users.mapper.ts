import type { UserModel } from "@/database/generated/prisma/models.js";

export type PublicUser = Omit<UserModel, "password" | "twoFactorSecret" | "twoFactorRecoveryCodes">;

export function toPublicUser(user: UserModel): PublicUser {
    const {
        password: _password,
        twoFactorSecret: _twoFactorSecret,
        twoFactorRecoveryCodes: _twoFactorRecoveryCodes,
        ...publicUser
    } = user;
    return publicUser;
}
