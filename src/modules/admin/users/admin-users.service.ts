import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { Role } from "@/database/generated/prisma/enums.js";
import type { UserModel } from "@/database/generated/prisma/models.js";
import { AuthService } from "@/modules/auth/auth.service.js";
import { TokensService } from "@/modules/auth/tokens.service.js";
import type { AdminUpdateUserInput } from "@/modules/admin/users/dto/admin-update-user.schema.js";
import type { ListUsersInput } from "@/modules/admin/users/dto/list-users.schema.js";
import { UsersService } from "@/modules/users/users.service.js";
import { toPublicUser } from "@/modules/users/users.mapper.js";

@Injectable()
export class AdminUsersService {
    constructor(
        private readonly usersService: UsersService,
        private readonly tokensService: TokensService,
        private readonly authService: AuthService,
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

        if (data.role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenException("Only the super admin can promote a user to admin");
        }

        const updated = await this.usersService.updateByAdmin(target.id, data);
        return toPublicUser(updated);
    }

    async updateStatus(actor: AuthenticatedUser, targetId: string, status: "ACTIVE" | "SUSPENDED") {
        const target = await this.findManageableTarget(actor, targetId);
        const updated = await this.usersService.updateStatus(target.id, status);

        if (status === "SUSPENDED") {
            await this.tokensService.revokeAllRefreshTokens(target.id);
        }

        return toPublicUser(updated);
    }

    async softDelete(actor: AuthenticatedUser, targetId: string) {
        const target = await this.findManageableTarget(actor, targetId);
        const updated = await this.usersService.softDelete(target.id);
        await this.tokensService.revokeAllRefreshTokens(target.id);
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
    }

    async inviteAdmin(actor: AuthenticatedUser, email: string) {
        if (actor.role !== Role.SUPER_ADMIN) {
            throw new ForbiddenException("Only the super admin can invite new admins");
        }
        return this.authService.inviteAdmin(email);
    }

    /** Loads the target user and enforces: ADMIN manages only USER accounts, SUPER_ADMIN manages everyone. */
    private async findManageableTarget(
        actor: AuthenticatedUser,
        targetId: string,
        options: { includeDeleted?: boolean } = {},
    ): Promise<UserModel> {
        const target = await this.usersService.findById(targetId);

        if (!target || (target.deletedAt && !options.includeDeleted)) {
            throw new NotFoundException("User not found");
        }

        if (actor.role === Role.ADMIN && target.role !== Role.USER) {
            throw new ForbiddenException("You do not have permission to manage this account");
        }

        return target;
    }
}
