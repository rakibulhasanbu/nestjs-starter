import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Env } from "@/config/env.schema.js";
import { UsersService } from "@/modules/users/users.service.js";

@Injectable()
export class UsersCleanupTask {
    private readonly logger = new Logger(UsersCleanupTask.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly configService: ConfigService<Env, true>,
    ) {}

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async purgeExpiredDeletedUsers(): Promise<void> {
        const graceDays = this.configService.get("DELETED_USER_GRACE_DAYS", { infer: true });
        const count = await this.usersService.purgeExpiredDeleted(graceDays);
        if (count > 0) {
            this.logger.log(`Purged ${count} soft-deleted user(s) past the ${graceDays}-day grace period`);
        }
    }
}
