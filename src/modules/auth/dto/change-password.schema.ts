import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const changePasswordSchema = z.strictObject({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(72),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
