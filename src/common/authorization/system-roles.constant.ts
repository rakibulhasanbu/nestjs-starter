import { PERMISSIONS, type PermissionKey } from "@/common/authorization/permissions.constant.js";

/**
 * Roles the application itself depends on. They are seeded with `isSystem: true`,
 * which blocks deletion and renaming — code and migrations reference these ids
 * directly (signup assigns USER, the DB enforces a single SUPER_ADMIN), so losing
 * one would break the system with no recovery path.
 *
 * Their *permissions* remain editable; only the role record is protected.
 */
export const SYSTEM_ROLE_IDS = {
    USER: "user",
    ADMIN: "admin",
    SUPER_ADMIN: "super_admin",
} as const;

export type SystemRoleId = (typeof SYSTEM_ROLE_IDS)[keyof typeof SYSTEM_ROLE_IDS];

export interface SystemRoleDefinition {
    id: SystemRoleId;
    name: string;
    description: string;
    /**
     * Management hierarchy. An actor may only act on users whose highest rank is
     * strictly below their own, which is what stops an admin from touching the
     * super admin — or another admin. Grants no permissions by itself.
     */
    rank: number;
    /** `null` means "every permission in the catalog", re-resolved on each seed. */
    permissions: readonly PermissionKey[] | null;
}

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
    {
        id: SYSTEM_ROLE_IDS.USER,
        name: "User",
        description: "Baseline role every account receives on signup. Account self-management only.",
        rank: 0,
        permissions: [],
    },
    {
        id: SYSTEM_ROLE_IDS.ADMIN,
        name: "Admin",
        description: "Manages regular user accounts and their sessions.",
        rank: 50,
        permissions: [
            PERMISSIONS.USER_READ_ANY,
            PERMISSIONS.USER_UPDATE_ANY,
            PERMISSIONS.USER_RESTORE_ANY,
            PERMISSIONS.USER_STATUS_ANY,
            PERMISSIONS.USER_PASSWORD_RESET_ANY,
            PERMISSIONS.SESSION_READ_ANY,
            PERMISSIONS.SESSION_REVOKE_ANY,
            PERMISSIONS.ROLE_READ,
            PERMISSIONS.PERMISSION_READ,
        ],
    },
    {
        id: SYSTEM_ROLE_IDS.SUPER_ADMIN,
        name: "Super Admin",
        description: "Full control. Seed-only singleton — the database permits exactly one holder.",
        rank: 100,
        permissions: null,
    },
];
