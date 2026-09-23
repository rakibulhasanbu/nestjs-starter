import { Global, Module } from "@nestjs/common";
import { RedisService } from "@/integrations/redis/redis.service.js";

@Global()
@Module({
    providers: [RedisService],
    exports: [RedisService],
})
export class RedisModule {}
