import type { UserModel, UserProfileModel } from "@/database/generated/prisma/models.js";
import type { UserWithRoles } from "@/modules/users/users.service.js";

export type PublicUserProfile = Pick<UserProfileModel, "gender" | "bio"> & {
    /** Calendar date (YYYY-MM-DD) — it is stored as a `DATE`, so never expose a timestamp. */
    dateOfBirth: string | null;
};

export type PublicUser = Omit<
    UserModel,
    "password" | "twoFactorSecret" | "twoFactorRecoveryCodes" | "twoFactorLastUsedStep"
> & {
    roleIds: string[];
    profile: PublicUserProfile | null;
};

export function toPublicUser(user: UserWithRoles): PublicUser {
    const {
        password: _password,
        twoFactorSecret: _twoFactorSecret,
        twoFactorRecoveryCodes: _twoFactorRecoveryCodes,
        twoFactorLastUsedStep: _twoFactorLastUsedStep,
        roles,
        profile,
        ...publicUser
    } = user;

    return {
        ...publicUser,
        roleIds: roles.map(({ roleId }) => roleId),
        profile: profile ? toPublicUserProfile(profile) : null,
    };
}

function toPublicUserProfile(profile: UserProfileModel): PublicUserProfile {
    return {
        dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        gender: profile.gender,
        bio: profile.bio,
    };
}
