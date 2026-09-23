import type { ConfigService } from "@nestjs/config";
import { buildCorsOptions } from "@/config/cors.config.js";
import type { Env } from "@/config/env.schema.js";

function configWith(corsOrigins: string[] | undefined): ConfigService<Env, true> {
    return { get: () => corsOrigins } as unknown as ConfigService<Env, true>;
}

describe("buildCorsOptions", () => {
    it("uses the configured allow-list when one is set", () => {
        expect(buildCorsOptions(configWith(["https://app.example.com"])).origin).toEqual([
            "https://app.example.com",
        ]);
    });

    it("falls back to reflecting the origin when unset or empty", () => {
        expect(buildCorsOptions(configWith(undefined)).origin).toBe(true);
        expect(buildCorsOptions(configWith([])).origin).toBe(true);
    });

    it("keeps credentials off — the API is Bearer-token based, not cookie based", () => {
        expect(buildCorsOptions(configWith(undefined)).credentials).toBe(false);
    });
});
