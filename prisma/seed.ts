import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { Redis } from "ioredis";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { UserStatus } from "@/database/generated/prisma/enums.js";
import { PERMISSION_CATALOG } from "@/common/authorization/permissions.constant.js";
import {
    PERM_CACHE_KEY_PREFIX,
    PERM_INVALIDATE_ALL,
    PERM_INVALIDATION_CHANNEL,
} from "@/common/authorization/permission-cache-keys.constant.js";
import { SYSTEM_ROLES, SYSTEM_ROLE_IDS } from "@/common/authorization/system-roles.constant.js";
import { envSchema } from "@/config/env.schema.js";

type Db = PrismaClient;

/**
 * Reconciles the permissions table against the catalog declared in code, which
 * is the source of truth. Removing a key from the catalog deletes it here too,
 * cascading to any role that referenced it — so a retired permission cannot
 * linger and keep granting access.
 */
async function syncPermissions(prisma: Db): Promise<void> {
    for (const permission of PERMISSION_CATALOG) {
        await prisma.permission.upsert({
            where: { key: permission.key },
            update: {
                resource: permission.resource,
                action: permission.action,
                scope: permission.scope,
                description: permission.description,
            },
            create: permission,
        });
    }

    const { count } = await prisma.permission.deleteMany({
        where: { key: { notIn: PERMISSION_CATALOG.map(permission => permission.key) } },
    });

    console.log(`Permissions synced: ${PERMISSION_CATALOG.length} current, ${count} removed`);
}

/**
 * Upserts the roles the application itself depends on. Their permission sets are
 * rewritten from code on every run; roles created through the API are untouched.
 */
async function syncSystemRoles(prisma: Db): Promise<void> {
    const allKeys = PERMISSION_CATALOG.map(permission => permission.key);

    for (const definition of SYSTEM_ROLES) {
        const permissions = definition.permissions === null ? allKeys : [...definition.permissions];

        await prisma.role.upsert({
            where: { id: definition.id },
            update: {
                name: definition.name,
                description: definition.description,
                rank: definition.rank,
                isSystem: true,
            },
            create: {
                id: definition.id,
                name: definition.name,
                description: definition.description,
                rank: definition.rank,
                isSystem: true,
            },
        });

        await prisma.rolePermission.deleteMany({
            where: { roleId: definition.id, permissionKey: { notIn: permissions } },
        });
        await prisma.rolePermission.createMany({
            data: permissions.map(permissionKey => ({ roleId: definition.id, permissionKey })),
            skipDuplicates: true,
        });

        console.log(`Role ready: ${definition.id} (${permissions.length} permissions)`);
    }

    // Anyone holding a system role may have just gained or lost permissions.
    await prisma.user.updateMany({
        where: { roles: { some: { roleId: { in: SYSTEM_ROLES.map(role => role.id) } } } },
        data: { permVersion: { increment: 1 } },
    });
}

/**
 * This script writes permVersion straight to the database, behind the back of any
 * running instance. Without clearing what they have cached, every affected user
 * would be locked out until the cache TTL expired — their freshly issued tokens
 * would disagree with the stale cached version. So drop the cache and tell every
 * instance to empty its in-memory copy.
 */
async function flushPermissionCache(redisUrl: string): Promise<void> {
    const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

    try {
        await redis.connect();

        let cursor = "0";
        let removed = 0;

        do {
            const [next, keys] = await redis.scan(cursor, "MATCH", `${PERM_CACHE_KEY_PREFIX}*`, "COUNT", 500);
            cursor = next;
            if (keys.length > 0) {
                removed += await redis.del(...keys);
            }
        } while (cursor !== "0");

        await redis.publish(PERM_INVALIDATION_CHANNEL, PERM_INVALIDATE_ALL);
        console.log(`Permission cache flushed: ${removed} keys removed`);
    } catch (error) {
        console.warn(
            `Could not flush the permission cache (${(error as Error).message}). ` +
                "Running instances will self-correct once their cache TTL expires.",
        );
    } finally {
        redis.disconnect();
    }
}

/**
 * Bootstraps the single super admin from env vars. This is the only way one can
 * ever be created — there is no API path, and a partial unique index on
 * user_roles enforces that at most one account holds the role.
 */
async function seedSuperAdmin(prisma: Db, email: string, password: string): Promise<void> {
    const existing = await prisma.userRole.findFirst({
        where: { roleId: SYSTEM_ROLE_IDS.SUPER_ADMIN },
        include: { user: true },
    });

    if (existing && existing.user.email !== email) {
        throw new Error(
            `A super admin already exists (${existing.user.email}). Only one can ever exist; refusing to create another.`,
        );
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.upsert({
        where: { email },
        update: { password: passwordHash, status: UserStatus.ACTIVE },
        create: {
            email,
            username: "superadmin",
            password: passwordHash,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
        },
    });

    await prisma.userRole.createMany({
        data: [
            { userId: user.id, roleId: SYSTEM_ROLE_IDS.USER },
            { userId: user.id, roleId: SYSTEM_ROLE_IDS.SUPER_ADMIN },
        ],
        skipDuplicates: true,
    });

    console.log(`Super admin ready: ${user.email}`);
}

async function main() {
    const env = envSchema.parse(process.env);

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    });

    await syncPermissions(prisma);
    await syncSystemRoles(prisma);
    await seedSuperAdmin(prisma, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
    await flushPermissionCache(env.REDIS_URL);

    await prisma.$disconnect();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
