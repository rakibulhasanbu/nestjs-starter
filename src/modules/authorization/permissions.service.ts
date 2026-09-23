import { Injectable } from "@nestjs/common";
import type { PermissionKey } from "@/common/authorization/permissions.constant.js";
import type { Prisma } from "@/database/generated/prisma/client.js";
import { PrismaService } from "@/database/prisma.service.js";
import { PermissionsCacheService } from "@/modules/authorization/permissions-cache.service.js";
import type { ResolvedPrincipal } from "@/modules/authorization/resolved-principal.type.js";

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

/**
 * Turns a user id into the permission set the guard authorizes against.
 *
 * Reads go through the cache; writes bump `permVersion` and invalidate it. The
 * two halves are what make the system both fast and safe to revoke from: the
 * cache removes the per-request join, and the version makes any entry the cache
 * failed to drop detectably stale.
 */
@Injectable()
export class PermissionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: PermissionsCacheService,
    ) {}

    async resolve(userId: string): Promise<ResolvedPrincipal | null> {
        const cached = await this.cache.get(userId);

        if (cached) {
            return cached;
        }

        const principal = await this.readFromDatabase(userId);

        if (principal) {
            await this.cache.set(principal);
        }

        return principal;
    }

    /**
     * Drops this user's cached principal without touching any version marker.
     * Required after any change to `status` or `deletedAt` that does not already
     * bump a version — the guard now authorizes against those fields, so a stale
     * entry would keep a reactivated account locked out (or, after a restore,
     * keep reporting it as deleted) until the cache TTL expired.
     */
    async invalidateCache(userId: string): Promise<void> {
        await this.cache.invalidate(userId);
    }

    /**
     * Invalidates every access token this user holds, forcing a refresh that
     * picks up their new permissions. Pass `tx` when the role change itself is
     * transactional, so the version can never advance without the change landing.
     */
    async bumpPermVersion(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
        await (tx ?? this.prisma).user.update({
            where: { id: userId },
            data: { permVersion: { increment: 1 } },
        });
        await this.cache.invalidate(userId);
    }

    async bumpPermVersionForRole(roleId: string): Promise<void> {
        const assignments = await this.prisma.userRole.findMany({
            where: { roleId },
            select: { userId: true },
        });
        const userIds = assignments.map(assignment => assignment.userId);

        if (userIds.length === 0) {
            return;
        }

        await this.prisma.user.updateMany({
            where: { id: { in: userIds } },
            data: { permVersion: { increment: 1 } },
        });
        await this.cache.invalidateMany(userIds);
    }

    /** Kills every existing session outright — for password changes and global logout. */
    async bumpTokenVersion(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
        await (tx ?? this.prisma).user.update({
            where: { id: userId },
            data: { tokenVersion: { increment: 1 } },
        });
        await this.cache.invalidate(userId);
    }

    async assignRoles(userId: string, roleIds: string[], assignedBy: string): Promise<void> {
        await this.prisma.$transaction(async tx => {
            await tx.userRole.deleteMany({ where: { userId, roleId: { notIn: roleIds } } });
            await tx.userRole.createMany({
                data: roleIds.map(roleId => ({ userId, roleId, assignedBy })),
                skipDuplicates: true,
            });
            await tx.user.update({ where: { id: userId }, data: { permVersion: { increment: 1 } } });
        });

        await this.cache.invalidate(userId);
    }

    /** Grants the baseline role to a freshly created account. Runs inside the caller's transaction when given one. */
    async assignRolesOnCreate(userId: string, roleIds: string[], client: PrismaClientLike): Promise<void> {
        await client.userRole.createMany({
            data: roleIds.map(roleId => ({ userId, roleId })),
            skipDuplicates: true,
        });
    }

    private async readFromDatabase(userId: string): Promise<ResolvedPrincipal | null> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                status: true,
                deletedAt: true,
                permVersion: true,
                tokenVersion: true,
                roles: {
                    select: {
                        role: {
                            select: {
                                id: true,
                                rank: true,
                                permissions: { select: { permissionKey: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            return null;
        }

        const permissions = new Set<PermissionKey>();
        let maxRank = 0;

        for (const { role } of user.roles) {
            maxRank = Math.max(maxRank, role.rank);
            for (const { permissionKey } of role.permissions) {
                permissions.add(permissionKey as PermissionKey);
            }
        }

        return {
            userId: user.id,
            status: user.status,
            isDeleted: user.deletedAt !== null,
            roleIds: user.roles.map(({ role }) => role.id),
            permissions,
            maxRank,
            permVersion: user.permVersion,
            tokenVersion: user.tokenVersion,
        };
    }
}
