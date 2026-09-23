import { SetMetadata } from "@nestjs/common";

export const AUTHENTICATED_ONLY_KEY = "authenticatedOnly";

/**
 * Marks a route that any signed-in account may call regardless of permissions —
 * account self-management (change password, own sessions, 2FA, delete own account).
 *
 * Needed because PermissionsGuard denies by default: a route carrying neither
 * this nor @RequirePermissions is refused, so forgetting a decorator closes an
 * endpoint instead of exposing it.
 */
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY_KEY, true);
