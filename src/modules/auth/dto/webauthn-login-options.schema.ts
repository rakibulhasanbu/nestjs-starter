import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const webauthnLoginOptionsSchema = z.strictObject({
    email: z.email(),
});

export type WebauthnLoginOptionsInput = z.infer<typeof webauthnLoginOptionsSchema>;

export class WebauthnLoginOptionsDto extends createZodDto(webauthnLoginOptionsSchema) {}
