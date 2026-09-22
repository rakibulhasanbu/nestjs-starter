import { Module } from "@nestjs/common";
import { UsersController } from "@/modules/users/users.controller.js";
import { UsersService } from "@/modules/users/users.service.js";
import { UsersCleanupTask } from "@/modules/users/users-cleanup.task.js";

@Module({
    controllers: [UsersController],
    providers: [UsersService, UsersCleanupTask],
    exports: [UsersService],
})
export class UsersModule {}
