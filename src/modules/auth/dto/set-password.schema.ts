import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const setPasswordSchema = z.strictObject({
    newPassword: z.string().min(8).max(72),
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export class SetPasswordDto extends createZodDto(setPasswordSchema) {}
