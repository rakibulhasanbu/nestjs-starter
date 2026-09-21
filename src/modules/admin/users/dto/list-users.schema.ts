import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { Role, UserStatus } from "@/database/generated/prisma/enums.js";

export const listUsersSchema = z.strictObject({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().min(1).max(100).optional(),
    role: z.enum(Role).optional(),
    status: z.enum(UserStatus).optional(),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;

export class ListUsersDto extends createZodDto(listUsersSchema) {}
