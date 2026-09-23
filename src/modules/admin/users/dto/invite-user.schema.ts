import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const inviteUserSchema = z.strictObject({
    email: z.email(),
    roleIds: z.array(z.string().min(1).max(50)).max(20).default([]),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export class InviteUserDto extends createZodDto(inviteUserSchema) {}
