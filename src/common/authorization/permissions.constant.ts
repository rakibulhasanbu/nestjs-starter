/**
 * The permission catalog — the single source of truth.
 *
 * Nothing in the application ever checks a role name; it checks a permission
 * key from this list. Roles are just bundles of these keys, which is what lets
 * new roles be created at runtime without touching code.
 *
 * The seed reconciles the `permissions` table against this file: keys added
 * here are inserted, keys removed here are deleted (cascading to any role that
 * referenced them). So this file is what ships, and the table merely mirrors it.
 */

export interface PermissionDefinition {
    key: string;
    resource: string;
    action: string;
    /** "any" = across all records, "own" = only the actor's own records. */
    scope: "any" | "own" | "";
    description: string;
}

export const PERMISSIONS = {
    USER_READ_ANY: "user:read:any",
    USER_UPDATE_ANY: "user:update:any",
    USER_RESTORE_ANY: "user:restore:any",
    USER_STATUS_ANY: "user:status:any",
    USER_INVITE: "user:invite",
    USER_PASSWORD_RESET_ANY: "user:password-reset:any",

    SESSION_READ_ANY: "session:read:any",
    SESSION_REVOKE_ANY: "session:revoke:any",

    ROLE_READ: "role:read",
    ROLE_WRITE: "role:write",
    ROLE_ASSIGN: "role:assign",

    PERMISSION_READ: "permission:read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
    {
        key: PERMISSIONS.USER_READ_ANY,
        resource: "user",
        action: "read",
        scope: "any",
        description: "View any user account",
    },
    {
        key: PERMISSIONS.USER_UPDATE_ANY,
        resource: "user",
        action: "update",
        scope: "any",
        description: "Edit any user's profile fields",
    },
    {
        key: PERMISSIONS.USER_RESTORE_ANY,
        resource: "user",
        action: "restore",
        scope: "any",
        description: "Restore an account the owner deleted, while its grace period lasts",
    },
    {
        key: PERMISSIONS.USER_STATUS_ANY,
        resource: "user",
        action: "status",
        scope: "any",
        description: "Activate or suspend any user account",
    },
    {
        key: PERMISSIONS.USER_INVITE,
        resource: "user",
        action: "invite",
        scope: "",
        description: "Invite a new user and assign them roles",
    },
    {
        key: PERMISSIONS.USER_PASSWORD_RESET_ANY,
        resource: "user",
        action: "password-reset",
        scope: "any",
        description: "Trigger a password reset email for any user",
    },
    {
        key: PERMISSIONS.SESSION_READ_ANY,
        resource: "session",
        action: "read",
        scope: "any",
        description: "List the active sessions of any user",
    },
    {
        key: PERMISSIONS.SESSION_REVOKE_ANY,
        resource: "session",
        action: "revoke",
        scope: "any",
        description: "Revoke the sessions of any user",
    },
    {
        key: PERMISSIONS.ROLE_READ,
        resource: "role",
        action: "read",
        scope: "",
        description: "View roles and the permissions attached to them",
    },
    {
        key: PERMISSIONS.ROLE_WRITE,
        resource: "role",
        action: "write",
        scope: "",
        description: "Create, edit and delete roles, and change their permissions",
    },
    {
        key: PERMISSIONS.ROLE_ASSIGN,
        resource: "role",
        action: "assign",
        scope: "",
        description: "Grant or revoke a user's roles",
    },
    {
        key: PERMISSIONS.PERMISSION_READ,
        resource: "permission",
        action: "read",
        scope: "",
        description: "View the permission catalog",
    },
];
