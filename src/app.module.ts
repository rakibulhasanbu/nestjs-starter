import { Module } from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { ZodValidationPipe } from "nestjs-zod";
import { validateEnv } from "@/config/env.schema.js";
import { PrismaModule } from "@/database/prisma.module.js";
import { RedisModule } from "@/integrations/redis/redis.module.js";
import { HealthModule } from "@/modules/health/health.module.js";
import { AuthModule } from "@/modules/auth/auth.module.js";
import { AuthorizationModule } from "@/modules/authorization/authorization.module.js";
import { UsersModule } from "@/modules/users/users.module.js";
import { AdminUsersModule } from "@/modules/admin/users/admin-users.module.js";
import { AdminRolesModule } from "@/modules/admin/roles/admin-roles.module.js";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "@/common/guards/permissions.guard.js";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 60 }] }),
        ScheduleModule.forRoot(),
        PrismaModule,
        RedisModule,
        AuthorizationModule,
        HealthModule,
        AuthModule,
        UsersModule,
        AdminUsersModule,
        AdminRolesModule,
    ],
    controllers: [],
    providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        // Order matters: JwtAuthGuard proves identity and puts the token claims on
        // the request; PermissionsGuard then resolves the real permission set and
        // authorizes against it.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
})
export class AppModule {}
