import { Controller, Get } from "@nestjs/common";
import { DiskHealthIndicator, HealthCheck, HealthCheckService, MemoryHealthIndicator } from "@nestjs/terminus";
import { Public } from "@/common/decorators/public.decorator.js";
import { PrismaHealthIndicator } from "@/modules/health/indicators/prisma.health.js";

@Public()
@Controller("health")
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
        private readonly prisma: PrismaHealthIndicator,
        private readonly memory: MemoryHealthIndicator,
        private readonly disk: DiskHealthIndicator,
    ) {}

    /**
     * Liveness probe - confirms the process is up and able to respond.
     * Should not depend on external resources (DB, disk, etc).
     */
    @Get("live")
    @HealthCheck()
    live() {
        return this.health.check([() => this.memory.checkHeap("memory_heap", 300 * 1024 * 1024)]);
    }

    /**
     * Readiness probe - confirms the app can serve traffic,
     * including dependency checks (database, disk space, etc).
     */
    @Get("ready")
    @HealthCheck()
    ready() {
        return this.health.check([
            () => this.prisma.isHealthy("database"),
            () => this.disk.checkStorage("disk", { path: "/", thresholdPercent: 0.9 }),
        ]);
    }

    /**
     * Aggregate health check combining liveness and readiness.
     */
    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            () => this.memory.checkHeap("memory_heap", 300 * 1024 * 1024),
            () => this.prisma.isHealthy("database"),
            () => this.disk.checkStorage("disk", { path: "/", thresholdPercent: 0.9 }),
        ]);
    }
}
