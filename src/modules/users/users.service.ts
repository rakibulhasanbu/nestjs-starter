import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service.js";
import { Role, UserStatus } from "@/database/generated/prisma/enums.js";
import type { UserModel } from "@/database/generated/prisma/models.js";

export interface CreateUserData {
    email: string;
    passwordHash?: string;
    name?: string;
    role?: Role;
    status?: UserStatus;
    emailVerifiedAt?: Date;
}

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    findByEmail(email: string): Promise<UserModel | null> {
        return this.prisma.user.findUnique({ where: { email } });
    }

    findById(id: string): Promise<UserModel | null> {
        return this.prisma.user.findUnique({ where: { id } });
    }

    async findActiveById(id: string): Promise<UserModel | null> {
        const user = await this.prisma.user.findUnique({ where: { id } });
        return user && !user.deletedAt ? user : null;
    }

    async createUser(data: CreateUserData): Promise<UserModel> {
        const username = await this.generateUniqueUsername(data.email);

        return this.prisma.user.create({
            data: {
                email: data.email,
                username,
                password: data.passwordHash,
                name: data.name,
                role: data.role ?? Role.USER,
                status: data.status ?? UserStatus.PENDING_VERIFICATION,
                emailVerifiedAt: data.emailVerifiedAt,
            },
        });
    }

    /** Derives a unique handle from the email local-part, suffixing on collision. */
    private async generateUniqueUsername(email: string): Promise<string> {
        const base = email
            .split("@")[0]!
            .toLowerCase()
            .replace(/[^a-z0-9_.]/g, "")
            .slice(0, 25) || "user";

        let candidate = base;
        let suffix = 1;

        while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
            suffix += 1;
            candidate = `${base}${suffix}`;
        }

        return candidate;
    }

    markEmailVerified(id: string): Promise<UserModel> {
        return this.prisma.user.update({
            where: { id },
            data: { emailVerifiedAt: new Date(), status: UserStatus.ACTIVE },
        });
    }

    setPassword(id: string, passwordHash: string): Promise<UserModel> {
        return this.prisma.user.update({ where: { id }, data: { password: passwordHash } });
    }

    updateProfile(
        id: string,
        data: Partial<Pick<UserModel, "name" | "username" | "phone" | "avatarUrl">>,
    ): Promise<UserModel> {
        return this.prisma.user.update({ where: { id }, data });
    }

    async recordFailedLogin(id: string, maxAttempts: number, lockoutMinutes: number): Promise<UserModel> {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
        const attempts = user.failedLoginAttempts + 1;
        const shouldLock = attempts >= maxAttempts;

        return this.prisma.user.update({
            where: { id },
            data: {
                failedLoginAttempts: shouldLock ? 0 : attempts,
                lockedUntil: shouldLock ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : user.lockedUntil,
            },
        });
    }

    resetFailedLogin(id: string): Promise<UserModel> {
        return this.prisma.user.update({
            where: { id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
        });
    }

    async list(params: {
        page: number;
        limit: number;
        search?: string;
        role?: Role;
        status?: UserStatus;
    }): Promise<{ items: UserModel[]; total: number }> {
        const where = {
            deletedAt: null,
            ...(params.role ? { role: params.role } : {}),
            ...(params.status ? { status: params.status } : {}),
            ...(params.search
                ? {
                      OR: [
                          { email: { contains: params.search, mode: "insensitive" as const } },
                          { username: { contains: params.search, mode: "insensitive" as const } },
                          { name: { contains: params.search, mode: "insensitive" as const } },
                      ],
                  }
                : {}),
        };

        const [items, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip: (params.page - 1) * params.limit,
                take: params.limit,
                orderBy: { createdAt: "desc" },
            }),
            this.prisma.user.count({ where }),
        ]);

        return { items, total };
    }

    updateByAdmin(
        id: string,
        data: Partial<Pick<UserModel, "name" | "username" | "email" | "phone" | "avatarUrl" | "role">>,
    ): Promise<UserModel> {
        return this.prisma.user.update({ where: { id }, data });
    }

    updateStatus(id: string, status: UserStatus): Promise<UserModel> {
        return this.prisma.user.update({ where: { id }, data: { status } });
    }

    softDelete(id: string): Promise<UserModel> {
        return this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    }

    restore(id: string): Promise<UserModel> {
        return this.prisma.user.update({ where: { id }, data: { deletedAt: null } });
    }
}
