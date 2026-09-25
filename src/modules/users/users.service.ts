import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service.js";
import { Gender, UserStatus } from "@/database/generated/prisma/enums.js";
import { SYSTEM_ROLE_IDS } from "@/common/authorization/system-roles.constant.js";
import type { UserModel, UserProfileModel } from "@/database/generated/prisma/models.js";
import type { UpdateNotificationPreferencesInput } from "@/modules/users/dto/update-notification-preferences.schema.js";
import { toSkipTake } from "@/common/utils/pagination.util.js";

/**
 * Role ids and the optional profile travel with every user this service returns
 * so callers never have to issue a second query to render or authorize against them.
 */
export type UserWithRoles = UserModel & {
    roles: { roleId: string }[];
    profile: UserProfileModel | null;
};

const withRoles = { roles: { select: { roleId: true } }, profile: true } as const;

export interface CreateUserData {
    email: string;
    passwordHash?: string;
    name?: string;
    phone?: string;
    /** Extra roles on top of the baseline `user` role every account receives. */
    roleIds?: string[];
    status?: UserStatus;
    emailVerifiedAt?: Date;
}

/** Personal details that live on `user_profiles`, not on the account row. */
export interface UpdateUserProfileData {
    dateOfBirth?: string;
    gender?: Gender;
    bio?: string;
}

export interface UpdateProfileData {
    name?: string;
    username?: string;
    phone?: string;
    avatarUrl?: string;
    profile?: UpdateUserProfileData;
}

export interface NotificationPreferences {
    loginEmailNotification: boolean;
    transactionsEmailNotification: boolean;
    transactionsPushNotification: boolean;
}

/** What a user without a saved row gets — must match the column defaults in schema.prisma. */
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
    loginEmailNotification: true,
    transactionsEmailNotification: true,
    transactionsPushNotification: true,
};

const notificationPreferencesSelect = {
    loginEmailNotification: true,
    transactionsEmailNotification: true,
    transactionsPushNotification: true,
} as const;

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    findByEmail(email: string): Promise<UserWithRoles | null> {
        return this.prisma.user.findUnique({ where: { email }, include: withRoles });
    }

    findById(id: string): Promise<UserWithRoles | null> {
        return this.prisma.user.findUnique({ where: { id }, include: withRoles });
    }

    findByIdOrThrow(id: string): Promise<UserWithRoles> {
        return this.prisma.user.findUniqueOrThrow({ where: { id }, include: withRoles });
    }

    async findActiveById(id: string): Promise<UserWithRoles | null> {
        const user = await this.prisma.user.findUnique({ where: { id }, include: withRoles });
        return user && !user.deletedAt ? user : null;
    }

    /**
     * Every account gets the baseline `user` role, created in the same statement
     * so an account can never exist without a role — a roleless user would resolve
     * to an empty permission set and silently fail every authorization check.
     */
    async createUser(data: CreateUserData): Promise<UserWithRoles> {
        const username = await this.generateUniqueUsername(data.email);
        const roleIds = [...new Set([SYSTEM_ROLE_IDS.USER, ...(data.roleIds ?? [])])];

        return this.prisma.user.create({
            data: {
                email: data.email,
                username,
                password: data.passwordHash,
                name: data.name,
                phone: data.phone,
                status: data.status ?? UserStatus.PENDING_VERIFICATION,
                emailVerifiedAt: data.emailVerifiedAt,
                roles: { create: roleIds.map(roleId => ({ roleId })) },
            },
            include: withRoles,
        });
    }

    /** Derives a unique handle from the email local-part, suffixing on collision. */
    private async generateUniqueUsername(email: string): Promise<string> {
        const base =
            email
                .split("@")[0]!
                .toLowerCase()
                .replace(/[^a-z0-9_.]/g, "")
                .slice(0, 25) || "user";

        let candidate = base;
        let suffix = 1;

        while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
            suffix += 1;
            candidate = `${base}${suffix}`;
        }

        return candidate;
    }

    /**
     * Promotes PENDING_VERIFICATION to ACTIVE, and only that. A SUSPENDED account
     * must stay suspended: this runs at the end of the email-verification and
     * password-reset flows, so unconditionally writing ACTIVE would turn either
     * flow into a way for a suspended user to lift their own suspension.
     */
    async markEmailVerified(id: string): Promise<UserWithRoles> {
        const current = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { status: true } });

        return this.prisma.user.update({
            where: { id },
            data: {
                emailVerifiedAt: new Date(),
                status: current.status === UserStatus.PENDING_VERIFICATION ? UserStatus.ACTIVE : undefined,
            },
            include: withRoles,
        });
    }

    setPassword(id: string, passwordHash: string): Promise<UserWithRoles> {
        return this.prisma.user.update({ where: { id }, data: { password: passwordHash }, include: withRoles });
    }

    /**
     * Account fields and profile fields land in two tables, so the profile row is
     * upserted: it is created lazily the first time a user fills anything in.
     */
    updateProfile(id: string, data: UpdateProfileData): Promise<UserWithRoles> {
        const { profile, ...account } = data;

        return this.prisma.user.update({
            where: { id },
            data: {
                ...account,
                ...(profile ? { profile: { upsert: toProfileUpsert(profile) } } : {}),
            },
            include: withRoles,
        });
    }

    async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
        const preferences = await this.prisma.notificationPreferences.findUnique({
            where: { userId },
            select: notificationPreferencesSelect,
        });
        return preferences ?? DEFAULT_NOTIFICATION_PREFERENCES;
    }

    /** Upserted because the row only exists once the user has saved preferences at least once. */
    updateNotificationPreferences(
        userId: string,
        data: UpdateNotificationPreferencesInput,
    ): Promise<NotificationPreferences> {
        return this.prisma.notificationPreferences.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data,
            select: notificationPreferencesSelect,
        });
    }

    async recordFailedLogin(id: string, maxAttempts: number, lockoutMinutes: number): Promise<UserWithRoles> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
        const attempts = user.failedLoginAttempts + 1;
        const shouldLock = attempts >= maxAttempts;

        return this.prisma.user.update({
            where: { id },
            data: {
                failedLoginAttempts: shouldLock ? 0 : attempts,
                lockedUntil: shouldLock ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : user.lockedUntil,
            },
            include: withRoles,
        });
    }

    resetFailedLogin(id: string): Promise<UserWithRoles> {
        return this.prisma.user.update({
            where: { id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
            include: withRoles,
        });
    }

    /**
     * `visibleTo` applies the same rule the single-record admin routes enforce: an
     * actor sees only accounts ranked below their own, plus themselves. Without it
     * the list happily returned the super admin to any admin who asked, while
     * fetching that same account by id answered 403.
     */
    async list(params: {
        page: number;
        limit: number;
        search?: string;
        roleId?: string;
        status?: UserStatus;
        deleted?: boolean;
        visibleTo: { actorId: string; maxRank: number };
    }): Promise<{ items: UserWithRoles[]; total: number }> {
        const where = {
            deletedAt: params.deleted ? { not: null } : null,
            AND: [
                {
                    OR: [
                        { id: params.visibleTo.actorId },
                        { roles: { none: { role: { rank: { gte: params.visibleTo.maxRank } } } } },
                    ],
                },
            ],
            ...(params.roleId ? { roles: { some: { roleId: params.roleId } } } : {}),
            ...(params.status ? { status: params.status } : {}),
            ...(params.search
                ? {
                      OR: [
                          { email: { contains: params.search, mode: "insensitive" as const } },
                          { username: { contains: params.search, mode: "insensitive" as const } },
                          { name: { contains: params.search, mode: "insensitive" as const } },
                      ],
                  }
                : {}),
        };

        const [items, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                ...toSkipTake(params),
                orderBy: { createdAt: "desc" },
                include: withRoles,
            }),
            this.prisma.user.count({ where }),
        ]);

        return { items, total };
    }

    /**
     * `resetEmailVerification` is set when the email address itself changed: the
     * new address is unproven, and leaving `emailVerifiedAt` in place would treat
     * it as confirmed — including for password-reset delivery.
     */
    updateByAdmin(
        id: string,
        data: Partial<Pick<UserModel, "name" | "username" | "email" | "phone" | "avatarUrl">>,
        options: { resetEmailVerification?: boolean } = {},
    ): Promise<UserWithRoles> {
        return this.prisma.user.update({
            where: { id },
            data: {
                ...data,
                ...(options.resetEmailVerification
                    ? { emailVerifiedAt: null, status: UserStatus.PENDING_VERIFICATION }
                    : {}),
            },
            include: withRoles,
        });
    }

    updateStatus(id: string, status: UserStatus): Promise<UserWithRoles> {
        return this.prisma.user.update({ where: { id }, data: { status }, include: withRoles });
    }

    softDelete(id: string): Promise<UserWithRoles> {
        return this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() }, include: withRoles });
    }

    restore(id: string): Promise<UserWithRoles> {
        return this.prisma.user.update({ where: { id }, data: { deletedAt: null }, include: withRoles });
    }

    /**
     * Hard-deletes soft-deleted users whose grace period has expired, which is
     * also what frees their unique email and username for reuse. Cascades take
     * the profile, roles, tokens and identities with them — any table added
     * later that must outlive the account (orders, audit rows) has to either
     * detach from `users` or be anonymized here instead.
     */
    async purgeExpiredDeleted(graceDays: number): Promise<number> {
        const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
        const { count } = await this.prisma.user.deleteMany({
            where: { deletedAt: { lt: cutoff } },
        });
        return count;
    }
}

/** Shared by create and update because the two halves of an upsert take the same shape. */
function toProfileUpsert(profile: UpdateUserProfileData) {
    const fields = {
        gender: profile.gender,
        bio: profile.bio,
        dateOfBirth: profile.dateOfBirth === undefined ? undefined : new Date(profile.dateOfBirth),
    };

    return { create: fields, update: fields };
}
