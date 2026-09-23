import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@/common/authorization/permissions.constant.js";

export const PERMISSIONS_KEY = "permissions";

export interface PermissionsMetadata {
    permissions: PermissionKey[];
    mode: "any" | "all";
}

/** Requires at least one of the given permissions; enforced by PermissionsGuard. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
    SetMetadata<string, PermissionsMetadata>(PERMISSIONS_KEY, { permissions, mode: "any" });

/** Requires every one of the given permissions. */
export const RequireAllPermissions = (...permissions: PermissionKey[]) =>
    SetMetadata<string, PermissionsMetadata>(PERMISSIONS_KEY, { permissions, mode: "all" });
