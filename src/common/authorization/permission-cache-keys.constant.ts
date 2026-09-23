/**
 * Shared between the running application and the seed script, which mutates
 * permVersion directly and must be able to clear what the app has cached.
 */
export const PERM_CACHE_KEY_PREFIX = "perm:user:";
export const PERM_INVALIDATION_CHANNEL = "perm:invalidate";

/** Broadcast on the invalidation channel to clear every in-memory entry at once. */
export const PERM_INVALIDATE_ALL = "*";

export function permCacheKey(userId: string): string {
    return `${PERM_CACHE_KEY_PREFIX}${userId}`;
}
