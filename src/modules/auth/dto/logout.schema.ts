import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const logoutSchema = z.strictObject({
    refreshToken: z.string().min(1),
});

export type LogoutInput = z.infer<typeof logoutSchema>;

export class LogoutDto extends createZodDto(logoutSchema) {}
