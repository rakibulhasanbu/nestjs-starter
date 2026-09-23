import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SYSTEM_ROLE_IDS } from "@/common/authorization/system-roles.constant.js";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { PrismaService } from "@/database/prisma.service.js";
import { AuthService } from "@/modules/auth/auth.service.js";
import { TokensService } from "@/modules/auth/tokens.service.js";
import { PermissionsService } from "@/modules/authorization/permissions.service.js";
import type { AdminUpdateUserInput } from "@/modules/admin/users/dto/admin-update-user.schema.js";
import type { AssignRolesInput } from "@/modules/admin/users/dto/assign-roles.schema.js";
import type { InviteUserInput } from "@/modules/admin/users/dto/invite-user.schema.js";
import type { ListUsersInput } from "@/modules/admin/users/dto/list-users.schema.js";
import { UsersService, type UserWithRoles } from "@/modules/users/users.service.js";
import { toPublicUser } from "@/modules/users/users.mapper.js";

@Injectable()
export class AdminUsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly usersService: UsersService,
        private readonly tokensService: TokensService,
        private readonly authService: AuthService,
        private readonly permissionsService: PermissionsService,
    ) {}

    async list(query: ListUsersInput) {
        const { items, total } = await this.usersService.list(query);
        return {
            data: items.map(toPublicUser),
            meta: { page: query.page, limit: query.limit, total },
        };
    }

    async getById(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId);
        return toPublicUser(target);
    }

    async update(actor: AuthenticatedUser, targetId: string, data: AdminUpdateUserInput) {
        const target = await this.findManageableTarget(actor, targetId);
        const updated = await this.usersService.updateByAdmin(target.id, data);
        return toPublicUser(updated);
    }

    /**
     * Replaces the target's roles wholesale. The actor may only grant roles ranked
     * below their own — otherwise an admin could hand themselves, or a peer, a role
     * they are not allowed to hold, escalating past their own ceiling.
     */
    async assignRoles(actor: AuthenticatedUser, targetId: string, data: AssignRolesInput) {
        const target = await this.findManageableTarget(actor, targetId);

        if (target.id === actor.id) {
            throw new ForbiddenException("You cannot change your own roles");
        }

        const roleIds = [...new Set([SYSTEM_ROLE_IDS.USER, ...data.roleIds])];
        const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });

        if (roles.length !== roleIds.length) {
            throw new BadRequestException("One or more roles do not exist");
        }

        const tooHigh = roles.find(role => role.rank >= actor.maxRank);
        if (tooHigh) {
            throw new ForbiddenException(`You cannot grant the "${tooHigh.name}" role`);
        }

        await this.permissionsService.assignRoles(target.id, roleIds, actor.id);

        return toPublicUser(await this.usersService.findByIdOrThrow(target.id));
    }

    async updateStatus(actor: AuthenticatedUser, targetId: string, status: "ACTIVE" | "SUSPENDED") {
        const target = await this.findManageableTarget(actor, targetId);
        const updated = await this.usersService.updateStatus(target.id, status);

        if (status === "SUSPENDED") {
            await this.tokensService.revokeAllRefreshTokens(target.id);
            await this.permissionsService.bumpTokenVersion(target.id);
        }

        return toPublicUser(updated);
    }

    async softDelete(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId);
        const updated = await this.usersService.softDelete(target.id);
        await this.tokensService.revokeAllRefreshTokens(target.id);
        await this.permissionsService.bumpTokenVersion(target.id);
        return toPublicUser(updated);
    }

    async restore(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId, { includeDeleted: true });
        const updated = await this.usersService.restore(target.id);
        return toPublicUser(updated);
    }

    async triggerPasswordReset(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId);
        await this.authService.forgotPassword(target.email);
    }

    async listSessions(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId);
        const sessions = await this.tokensService.listActiveSessions(target.id);
        return sessions.map(({ tokenHash: _tokenHash, ...session }) => session);
    }

    async revokeSession(actor: AuthenticatedUser, targetId: string, sessionId: string) {
        await this.findManageableTarget(actor, targetId);
        await this.tokensService.revokeSessionById(targetId, sessionId);
    }

    async revokeAllSessions(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId);
        await this.tokensService.revokeAllRefreshTokens(target.id);
        await this.permissionsService.bumpTokenVersion(target.id);
    }

    async invite(actor: AuthenticatedUser, data: InviteUserInput) {
        const roleIds = [...new Set([SYSTEM_ROLE_IDS.USER, ...data.roleIds])];
        const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });

        if (roles.length !== roleIds.length) {
            throw new BadRequestException("One or more roles do not exist");
        }

        const tooHigh = roles.find(role => role.rank >= actor.maxRank);
        if (tooHigh) {
            throw new ForbiddenException(`You cannot grant the "${tooHigh.name}" role`);
        }

        return this.authService.invite(data.email, roleIds);
    }

    /**
     * Loads the target and enforces the management hierarchy: an actor may only
     * act on users whose highest rank is strictly below their own. This replaces
     * the old hard-coded "ADMIN may only touch USER" check — the rule now holds
     * for any roles created at runtime, without further code changes.
     */
    private async findManageableTarget(
        actor: AuthenticatedUser,
        targetId: string,
        options: { includeDeleted?: boolean } = {},
    ): Promise<UserWithRoles> {
        const target = await this.usersService.findById(targetId);

        if (!target || (target.deletedAt && !options.includeDeleted)) {
            throw new NotFoundException("User not found");
        }

        if (target.id !== actor.id && (await this.rankOf(target)) >= actor.maxRank) {
            throw new ForbiddenException("You do not have permission to manage this account");
        }

        return target;
    }

    private async rankOf(user: UserWithRoles): Promise<number> {
        if (user.roles.length === 0) {
            return 0;
        }

        const aggregate = await this.prisma.role.aggregate({
            where: { id: { in: user.roles.map(({ roleId }) => roleId) } },
            _max: { rank: true },
        });

        return aggregate._max.rank ?? 0;
    }
}
