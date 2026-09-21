import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { Role, UserStatus } from "@/database/generated/prisma/enums.js";
import { envSchema } from "@/config/env.schema.js";

/**
 * Bootstraps the single SUPER_ADMIN account from env vars. Re-running this
 * script is idempotent (upserts the same account) — it is the only way a
 * SUPER_ADMIN can ever be created; there is no API path for it, and the DB
 * enforces at most one via a partial unique index on role = SUPER_ADMIN.
 */
async function main() {
    const env = envSchema.parse(process.env);

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    });

    const existingSuperAdmin = await prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN } });

    if (existingSuperAdmin && existingSuperAdmin.email !== env.ADMIN_EMAIL) {
        throw new Error(
            `A SUPER_ADMIN already exists (${existingSuperAdmin.email}). Only one can ever exist; refusing to create another.`,
        );
    }

    const passwordHash = await argon2.hash(env.ADMIN_PASSWORD);

    const user = await prisma.user.upsert({
        where: { email: env.ADMIN_EMAIL },
        update: { password: passwordHash, role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE },
        create: {
            email: env.ADMIN_EMAIL,
            username: "superadmin",
            password: passwordHash,
            role: Role.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
        },
    });

    console.log(`SUPER_ADMIN ready: ${user.email}`);

    await prisma.$disconnect();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
