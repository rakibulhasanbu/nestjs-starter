import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const webauthnLoginVerifySchema = z.strictObject({
    email: z.email(),
    credential: z.looseObject({}),
    deviceType: z.string().min(1).max(50).optional(),
    deviceName: z.string().min(1).max(100).optional(),
});

export type WebauthnLoginVerifyInput = z.infer<typeof webauthnLoginVerifySchema>;

export class WebauthnLoginVerifyDto extends createZodDto(webauthnLoginVerifySchema) {}
