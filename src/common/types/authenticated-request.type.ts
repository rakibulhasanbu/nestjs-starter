import type { Request } from "express";
import type { PermissionKey } from "@/common/authorization/permissions.constant.js";

/**
 * The request principal. Identity comes from the access token; roles, permissions
 * and rank are resolved server-side on every request by PermissionsGuard — the
 * token deliberately carries no authorization data, so revoking access takes
 * effect immediately rather than at token expiry.
 */
export interface AuthenticatedUser {
    id: string;
    email: string;
    roleIds: string[];
    permissions: ReadonlySet<PermissionKey>;
    /** Highest rank across the user's roles. An actor may only manage users ranked below them. */
    maxRank: number;
    /**
     * Which session this request came from (the refresh-token family id), so a
     * sessions list can point at the caller's own row. Undefined for access
     * tokens issued before the claim existed.
     */
    sessionId: string | undefined;
    can(permission: PermissionKey): boolean;
}

export interface AuthenticatedRequest extends Request {
    user: AuthenticatedUser;
}
