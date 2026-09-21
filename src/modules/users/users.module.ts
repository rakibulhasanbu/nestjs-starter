import { Module } from "@nestjs/common";
import { UsersController } from "@/modules/users/users.controller.js";
import { UsersService } from "@/modules/users/users.service.js";

@Module({
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule {}
