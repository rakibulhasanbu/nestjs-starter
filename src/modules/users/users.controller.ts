import { Body, Controller, Get, NotFoundException, Patch } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "@/common/types/authenticated-request.type.js";
import { UpdateMeDto } from "@/modules/users/dto/update-me.schema.js";
import { UsersService } from "@/modules/users/users.service.js";
import { toPublicUser } from "@/modules/users/users.mapper.js";

@Controller("users")
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get("me")
    async getMe(@CurrentUser() currentUser: AuthenticatedUser) {
        const user = await this.usersService.findActiveById(currentUser.id);
        if (!user) {
            throw new NotFoundException("User not found");
        }
        return toPublicUser(user);
    }

    @Patch("me")
    async updateMe(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: UpdateMeDto) {
        const user = await this.usersService.updateProfile(currentUser.id, dto);
        return toPublicUser(user);
    }
}
