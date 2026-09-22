import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface.js";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "@/config/env.schema.js";

export function buildCorsOptions(configService: ConfigService<Env, true>): CorsOptions {
    const corsOrigins = configService.get("CORS_ORIGINS", { infer: true });

    return {
        origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: false,
    };
}
