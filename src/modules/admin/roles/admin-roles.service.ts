import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { PERMISSION_CATALOG } from "@/common/authorization/permissions.constant.js";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { PrismaService } from "@/database/prisma.service.js";
import { PermissionsService } from "@/modules/authorization/permissions.service.js";
import type { CreateRoleInput } from "@/modules/admin/roles/dto/create-role.schema.js";
import type { UpdateRoleInput } from "@/modules/admin/roles/dto/update-role.schema.js";

@Injectable()
export class AdminRolesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionsService: PermissionsService,
    ) {}

    /** The catalog is served from code, not the table — the table only mirrors it. */
    listPermissions() {
        return PERMISSION_CATALOG;
    }

    async list() {
        const roles = await this.prisma.role.findMany({
            orderBy: { rank: "desc" },
            include: {
                permissions: { select: { permissionKey: true } },
                _count: { select: { users: true } },
            },
        });

        return roles.map(({ permissions, _count, ...role }) => ({
            ...role,
            permissions: permissions.map(({ permissionKey }) => permissionKey),
            userCount: _count.users,
        }));
    }

    async getById(id: string) {
        const role = await this.prisma.role.findUnique({
            where: { id },
            include: {
                permissions: { select: { permissionKey: true } },
                _count: { select: { users: true } },
            },
        });

        if (!role) {
            throw new NotFoundException("Role not found");
        }

        const { permissions, _count, ...rest } = role;
        return { ...rest, permissions: permissions.map(({ permissionKey }) => permissionKey), userCount: _count.users };
    }

    async create(actor: AuthenticatedUser, data: CreateRoleInput) {
        this.assertRankBelowActor(actor, data.rank);
        this.assertGrantable(actor, data.permissions);

        if (await this.prisma.role.findUnique({ where: { id: data.id } })) {
            throw new ConflictException("A role with this id already exists");
        }

        await this.assertPermissionsExist(data.permissions);

        await this.prisma.role.create({
            data: {
                id: data.id,
                name: data.name,
                description: data.description,
                rank: data.rank,
                permissions: { create: data.permissions.map(permissionKey => ({ permissionKey })) },
            },
        });

        return this.getById(data.id);
    }

    async update(actor: AuthenticatedUser, id: string, data: UpdateRoleInput) {
        const role = await this.prisma.role.findUnique({ where: { id } });

        if (!role) {
            throw new NotFoundException("Role not found");
        }

        // System roles keep their identity and rank — code depends on both — but their
        // permission sets stay editable, which is the whole point of storing them.
        if (role.isSystem && (data.name !== undefined || data.rank !== undefined)) {
            throw new ForbiddenException("A system role's name and rank cannot be changed");
        }

        this.assertRankBelowActor(actor, data.rank ?? role.rank);

        if (data.permissions) {
            this.assertGrantable(actor, data.permissions);
            await this.assertPermissionsExist(data.permissions);
        }

        await this.prisma.$transaction(async tx => {
            await tx.role.update({
                where: { id },
                data: { name: data.name, description: data.description, rank: data.rank },
            });

            if (data.permissions) {
                await tx.rolePermission.deleteMany({ where: { roleId: id } });
                await tx.rolePermission.createMany({
                    data: data.permissions.map(permissionKey => ({ roleId: id, permissionKey })),
                });
            }
        });

        // Everyone holding this role now has a different permission set, so every
        // access token they hold must be treated as stale.
        await this.permissionsService.bumpPermVersionForRole(id);

        return this.getById(id);
    }

    async remove(actor: AuthenticatedUser, id: string) {
        const role = await this.prisma.role.findUnique({
            where: { id },
            include: { _count: { select: { users: true } } },
        });

        if (!role) {
            throw new NotFoundException("Role not found");
        }

        if (role.isSystem) {
            throw new ForbiddenException("A system role cannot be deleted");
        }

        this.assertRankBelowActor(actor, role.rank);

        if (role._count.users > 0) {
            throw new ConflictException("Remove this role from all users before deleting it");
        }

        await this.prisma.role.delete({ where: { id } });
    }

    /**
     * Nobody may create or edit a role at or above their own rank — otherwise an
     * admin could mint a role outranking themselves and assign it onward.
     */
    private assertRankBelowActor(actor: AuthenticatedUser, rank: number): void {
        if (rank >= actor.maxRank) {
            throw new ForbiddenException("You cannot manage a role ranked at or above your own");
        }
    }

    /**
     * Nobody may put a permission into a role that they do not themselves hold —
     * without this, role editing is a direct privilege-escalation path.
     */
    private assertGrantable(actor: AuthenticatedUser, permissions: readonly string[]): void {
        const ungrantable = permissions.filter(permission => !actor.permissions.has(permission as never));

        if (ungrantable.length > 0) {
            throw new ForbiddenException(`You cannot grant permissions you do not hold: ${ungrantable.join(", ")}`);
        }
    }

    private async assertPermissionsExist(permissions: readonly string[]): Promise<void> {
        if (permissions.length === 0) {
            return;
        }

        const found = await this.prisma.permission.count({ where: { key: { in: [...permissions] } } });

        if (found !== new Set(permissions).size) {
            throw new BadRequestException("One or more permissions do not exist");
        }
    }
}
