import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Env } from "@/config/env.schema.js";

export type RedisMessageHandler = (message: string) => void;

/**
 * Owns the two connections this app needs: a command client and a dedicated
 * subscriber (a connection in subscribe mode cannot issue normal commands).
 *
 * Every consumer must treat Redis as an optimisation, never a dependency —
 * `isAvailable` reports whether the client is connected so callers can fall
 * back to their source of truth instead of failing the request.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly handlers = new Map<string, Set<RedisMessageHandler>>();

    readonly client: Redis;
    readonly subscriber: Redis;

    constructor(configService: ConfigService<Env, true>) {
        const url = configService.get("REDIS_URL", { infer: true });
        const options = {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
        };

        this.client = new Redis(url, options);
        this.subscriber = new Redis(url, options);

        for (const connection of [this.client, this.subscriber]) {
            connection.on("error", (error: Error) => this.logger.warn(`Redis error: ${error.message}`));
        }
    }

    async onModuleInit(): Promise<void> {
        this.subscriber.on("message", (channel: string, message: string) => {
            for (const handler of this.handlers.get(channel) ?? []) {
                handler(message);
            }
        });

        // Connect eagerly so a misconfigured URL surfaces at boot, but never block startup on it.
        await Promise.all([
            this.client.connect().catch(() => this.logger.warn("Redis unavailable at startup — falling back to DB")),
            this.subscriber.connect().catch(() => undefined),
        ]);
    }

    async onModuleDestroy(): Promise<void> {
        await Promise.all([this.client.quit().catch(() => undefined), this.subscriber.quit().catch(() => undefined)]);
    }

    get isAvailable(): boolean {
        return this.client.status === "ready";
    }

    async subscribe(channel: string, handler: RedisMessageHandler): Promise<void> {
        const existing = this.handlers.get(channel);

        if (existing) {
            existing.add(handler);
            return;
        }

        this.handlers.set(channel, new Set([handler]));
        await this.subscriber.subscribe(channel).catch((error: Error) => {
            this.logger.warn(`Failed to subscribe to ${channel}: ${error.message}`);
        });
    }

    async publish(channel: string, message: string): Promise<void> {
        if (!this.isAvailable) {
            return;
        }
        await this.client.publish(channel, message).catch(() => undefined);
    }
}
