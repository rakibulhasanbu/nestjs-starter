import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const resetPasswordSchema = z.strictObject({
    token: z.string().min(1),
    password: z.string().min(8).max(72),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
