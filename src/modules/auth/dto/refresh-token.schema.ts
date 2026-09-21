import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const refreshTokenSchema = z.strictObject({
    refreshToken: z.string().min(1),
    deviceType: z.string().min(1).max(50).optional(),
    deviceName: z.string().min(1).max(100).optional(),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export class RefreshTokenDto extends createZodDto(refreshTokenSchema) {}
