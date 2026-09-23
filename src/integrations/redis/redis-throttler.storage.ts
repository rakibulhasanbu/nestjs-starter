import { Logger } from "@nestjs/common";
import { ThrottlerStorageService } from "@nestjs/throttler";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface.js";
import { RedisService } from "@/integrations/redis/redis.service.js";

/**
 * Counts rate-limit hits in Redis so every instance shares one budget.
 *
 * The default storage is per-process, which quietly multiplies every limit by
 * the number of instances running — a 5-per-minute login limit becomes 5×N, and
 * the protection is weakest exactly when the deployment is largest.
 *
 * Redis stays optional here, as everywhere else in this codebase: if it is
 * unreachable the counters fall back to this process's memory. That is the old
 * behaviour, which is a weaker limit but still a limit — the alternative, failing
 * the request, would turn a Redis blip into a full outage.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
    private readonly logger = new Logger(RedisThrottlerStorage.name);
    private fallback?: ThrottlerStorageService;
    private hasWarned = false;

    constructor(private readonly redis: RedisService) {}

    async increment(
        key: string,
        ttl: number,
        limit: number,
        blockDuration: number,
        throttlerName: string,
    ): Promise<ThrottlerStorageRecord> {
        if (!this.redis.isAvailable) {
            return this.incrementInMemory(key, ttl, limit, blockDuration, throttlerName);
        }

        try {
            const hitKey = `throttle:${throttlerName}:${key}`;
            const result = (await this.redis.client.eval(
                INCREMENT_SCRIPT,
                2,
                hitKey,
                `${hitKey}:blocked`,
                ttl,
                limit,
                blockDuration,
            )) as [number, number, number, number];

            const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] = result;

            // The interface reports seconds, while ttl and blockDuration arrive in
            // milliseconds — the same asymmetry the in-memory storage has.
            return {
                totalHits,
                timeToExpire: Math.ceil(timeToExpireMs / 1000),
                isBlocked: isBlocked === 1,
                timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
            };
        } catch (error) {
            this.warnOnce((error as Error).message);
            return this.incrementInMemory(key, ttl, limit, blockDuration, throttlerName);
        }
    }

    private incrementInMemory(
        key: string,
        ttl: number,
        limit: number,
        blockDuration: number,
        throttlerName: string,
    ): Promise<ThrottlerStorageRecord> {
        // Created lazily: a deployment with a healthy Redis never allocates it.
        this.fallback ??= new ThrottlerStorageService();
        return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    private warnOnce(message: string): void {
        if (this.hasWarned) {
            return;
        }
        this.hasWarned = true;
        this.logger.warn(`Rate-limit counters fell back to memory: ${message}`);
    }
}

/**
 * One round trip, and atomic — two instances incrementing at once cannot both
 * read the same count and let a request through twice.
 */
const INCREMENT_SCRIPT = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockPttl = redis.call('PTTL', blockKey)
if blockPttl > 0 then
  local blockedHits = tonumber(redis.call('GET', hitKey) or '0')
  local blockedTtl = redis.call('PTTL', hitKey)
  if blockedTtl < 0 then blockedTtl = 0 end
  return { blockedHits, blockedTtl, 1, blockPttl }
end

local hits = redis.call('INCR', hitKey)
local pttl = redis.call('PTTL', hitKey)
if hits == 1 or pttl < 0 then
  redis.call('PEXPIRE', hitKey, ttl)
  pttl = ttl
end

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return { hits, pttl, 1, blockDuration }
end

return { hits, pttl, 0, 0 }
`;
