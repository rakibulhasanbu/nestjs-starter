import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const registerSchema = z.strictObject({
    email: z.email(),
    password: z.string().min(8).max(72),
    name: z.string().min(1).max(100).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export class RegisterDto extends createZodDto(registerSchema) {}
