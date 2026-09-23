import type { PermissionKey } from "@/common/authorization/permissions.constant.js";

/** Everything the guard needs to authorize a request, resolved from the database. */
export interface ResolvedPrincipal {
    userId: string;
    roleIds: string[];
    permissions: ReadonlySet<PermissionKey>;
    /** Highest rank across the user's roles; used for "who may manage whom" checks. */
    maxRank: number;
    permVersion: number;
    tokenVersion: number;
}

/** Wire format for the Redis layer — a Set does not survive JSON. */
export interface SerializedPrincipal {
    userId: string;
    roleIds: string[];
    permissions: string[];
    maxRank: number;
    permVersion: number;
    tokenVersion: number;
}

export function serializePrincipal(principal: ResolvedPrincipal): SerializedPrincipal {
    return { ...principal, permissions: [...principal.permissions] };
}

export function deserializePrincipal(payload: SerializedPrincipal): ResolvedPrincipal {
    return { ...payload, permissions: new Set(payload.permissions as PermissionKey[]) };
}
