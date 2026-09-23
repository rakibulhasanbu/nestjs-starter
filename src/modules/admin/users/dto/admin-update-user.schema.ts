import { z } from "zod";
import { createZodDto } from "nestjs-zod";

/** Roles are not editable here — they have their own endpoint and their own permission. */
export const adminUpdateUserSchema = z.strictObject({
    email: z.email().optional(),
    name: z.string().min(1).max(100).optional(),
    username: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-z0-9_.]+$/)
        .optional(),
    phone: z.string().min(5).max(20).optional(),
    avatarUrl: z.url().optional(),
});

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export class AdminUpdateUserDto extends createZodDto(adminUpdateUserSchema) {}
