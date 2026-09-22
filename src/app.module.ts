import { Module } from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { ZodValidationPipe } from "nestjs-zod";
import { validateEnv } from "@/config/env.schema.js";
import { PrismaModule } from "@/database/prisma.module.js";
import { HealthModule } from "@/modules/health/health.module.js";
import { AuthModule } from "@/modules/auth/auth.module.js";
import { UsersModule } from "@/modules/users/users.module.js";
import { AdminUsersModule } from "@/modules/admin/users/admin-users.module.js";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard.js";
import { RolesGuard } from "@/common/guards/roles.guard.js";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 60 }] }),
        ScheduleModule.forRoot(),
        PrismaModule,
        HealthModule,
        AuthModule,
        UsersModule,
        AdminUsersModule,
    ],
    controllers: [],
    providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AppModule {}
