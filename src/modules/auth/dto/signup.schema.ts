import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const signupSchema = z.strictObject({
    email: z.email(),
    password: z.string().min(8).max(72),
    name: z.string().min(1).max(100).optional(),
    phone: z.string().min(5).max(20).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

export class SignupDto extends createZodDto(signupSchema) {}
