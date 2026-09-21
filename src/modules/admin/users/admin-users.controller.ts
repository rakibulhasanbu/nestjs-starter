import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
} from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator.js";
import { Roles } from "@/common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { Role } from "@/database/generated/prisma/enums.js";
import { AdminUsersService } from "@/modules/admin/users/admin-users.service.js";
import { AdminUpdateUserDto } from "@/modules/admin/users/dto/admin-update-user.schema.js";
import { InviteAdminDto } from "@/modules/admin/users/dto/invite-admin.schema.js";
import { ListUsersDto } from "@/modules/admin/users/dto/list-users.schema.js";
import { UpdateStatusDto } from "@/modules/admin/users/dto/update-status.schema.js";

@Controller("admin/users")
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminUsersController {
    constructor(private readonly adminUsersService: AdminUsersService) {}

    @Get()
    list(@Query() query: ListUsersDto) {
        return this.adminUsersService.list(query);
    }

    @Get(":id")
    getById(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
        return this.adminUsersService.getById(actor, id);
    }

    @Patch(":id")
    update(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: AdminUpdateUserDto) {
        return this.adminUsersService.update(actor, id, dto);
    }

    @Patch(":id/status")
    updateStatus(
        @CurrentUser() actor: AuthenticatedUser,
        @Param("id") id: string,
        @Body() dto: UpdateStatusDto,
    ) {
        return this.adminUsersService.updateStatus(actor, id, dto.status);
    }

    @Delete(":id")
    softDelete(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
        return this.adminUsersService.softDelete(actor, id);
    }

    @Post(":id/restore")
    restore(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
        return this.adminUsersService.restore(actor, id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Post(":id/reset-password")
    triggerPasswordReset(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
        return this.adminUsersService.triggerPasswordReset(actor, id);
    }

    @Get(":id/sessions")
    listSessions(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
        return this.adminUsersService.listSessions(actor, id);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(":id/sessions/:sessionId")
    revokeSession(
        @CurrentUser() actor: AuthenticatedUser,
        @Param("id") id: string,
        @Param("sessionId") sessionId: string,
    ) {
        return this.adminUsersService.revokeSession(actor, id, sessionId);
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(":id/sessions")
    revokeAllSessions(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
        return this.adminUsersService.revokeAllSessions(actor, id);
    }

    @Roles(Role.SUPER_ADMIN)
    @HttpCode(HttpStatus.CREATED)
    @Post("invite-admin")
    inviteAdmin(@CurrentUser() actor: AuthenticatedUser, @Body() dto: InviteAdminDto) {
        return this.adminUsersService.inviteAdmin(actor, dto.email);
    }
}
