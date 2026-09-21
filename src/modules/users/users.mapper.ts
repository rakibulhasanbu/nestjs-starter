import type { UserModel } from "@/database/generated/prisma/models.js";

export type PublicUser = Omit<UserModel, "password">;

export function toPublicUser(user: UserModel): PublicUser {
    const { password: _password, ...publicUser } = user;
    return publicUser;
}
