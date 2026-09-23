import { Module } from "@nestjs/common";
import { AdminRolesController } from "@/modules/admin/roles/admin-roles.controller.js";
import { AdminRolesService } from "@/modules/admin/roles/admin-roles.service.js";

@Module({
    controllers: [AdminRolesController],
    providers: [AdminRolesService],
})
export class AdminRolesModule {}
