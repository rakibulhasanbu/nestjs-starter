import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const inviteAdminSchema = z.strictObject({
    email: z.email(),
});

export type InviteAdminInput = z.infer<typeof inviteAdminSchema>;

export class InviteAdminDto extends createZodDto(inviteAdminSchema) {}
