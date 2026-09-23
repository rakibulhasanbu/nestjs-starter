import { z } from "zod";
import { createZodDto } from "nestjs-zod";

/** Replaces the user's roles. The baseline `user` role is always re-added by the service. */
export const assignRolesSchema = z.strictObject({
    roleIds: z.array(z.string().min(1).max(50)).max(20),
});

export type AssignRolesInput = z.infer<typeof assignRolesSchema>;

export class AssignRolesDto extends createZodDto(assignRolesSchema) {}
