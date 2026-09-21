import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const googleLoginSchema = z.strictObject({
    idToken: z.string().min(1),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export class GoogleLoginDto extends createZodDto(googleLoginSchema) {}
