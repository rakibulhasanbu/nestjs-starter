import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { UserStatus } from "@/database/generated/prisma/enums.js";

export const listUsersSchema = z.strictObject({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().min(1).max(100).optional(),
    /** Role slug, e.g. "admin". Free-form because roles are created at runtime. */
    roleId: z.string().min(1).max(50).optional(),
    status: z.enum(UserStatus).optional(),
    /** `z.coerce.boolean()` would read the string "false" as true — every non-empty string is truthy. */
    deleted: z.stringbool().optional(),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;

export class ListUsersDto extends createZodDto(listUsersSchema) {}
