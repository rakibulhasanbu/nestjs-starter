import { z } from "zod";
import { createZodDto } from "nestjs-zod";

/** `id` is immutable — code and foreign keys reference it. Everything else may change. */
export const updateRoleSchema = z.strictObject({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    rank: z.number().int().min(0).max(99).optional(),
    permissions: z.array(z.string().min(1).max(100)).max(200).optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
