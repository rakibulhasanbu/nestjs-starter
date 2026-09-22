import { z } from "zod";

const baseEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(3000),
    APP_URL: z.url().default("http://localhost:3000"),

    DATABASE_URL: z.url(),

    CORS_ORIGINS: z
        .string()
        .optional()
        .transform((value) =>
            value
                ? value
                      .split(",")
                      .map((origin) => origin.trim())
                      .filter(Boolean)
                : undefined,
        )
        .pipe(z.array(z.url()).optional()),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default("15m"),
    JWT_REFRESH_TTL: z.string().default("30d"),

    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().default(24),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(30),

    LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().default(15),

    DELETED_USER_GRACE_DAYS: z.coerce.number().default(15),

    GOOGLE_CLIENT_ID: z.string().min(1),

    WEBAUTHN_RP_ID: z.string().min(1).default("localhost"),
    WEBAUTHN_RP_NAME: z.string().min(1).default("Nest Starter"),
    WEBAUTHN_ORIGIN: z.url().default("http://localhost:3000"),
    WEBAUTHN_CHALLENGE_TTL_MINUTES: z.coerce.number().default(5),

    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(8),
});

export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && (!data.CORS_ORIGINS || data.CORS_ORIGINS.length === 0)) {
        ctx.addIssue({
            code: "custom",
            path: ["CORS_ORIGINS"],
            message: "CORS_ORIGINS is required in production",
        });
    }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
    return envSchema.parse(config);
}
