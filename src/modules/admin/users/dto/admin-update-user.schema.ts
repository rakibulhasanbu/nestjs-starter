import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { Role } from "@/database/generated/prisma/enums.js";

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
    // SUPER_ADMIN can never be assigned here — it's a seed-only singleton.
    role: z.enum([Role.USER, Role.ADMIN]).optional(),
});

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export class AdminUpdateUserDto extends createZodDto(adminUpdateUserSchema) {}
