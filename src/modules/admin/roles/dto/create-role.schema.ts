import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const createRoleSchema = z.strictObject({
    /** Stable slug used as the primary key and referenced by code; not renameable afterwards. */
    id: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-z][a-z0-9_]*$/, "Role id must be lowercase letters, digits and underscores"),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    rank: z.number().int().min(0).max(99),
    permissions: z.array(z.string().min(1).max(100)).max(200).default([]),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export class CreateRoleDto extends createZodDto(createRoleSchema) {}
