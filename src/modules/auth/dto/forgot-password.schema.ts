import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const forgotPasswordSchema = z.strictObject({
    email: z.email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
