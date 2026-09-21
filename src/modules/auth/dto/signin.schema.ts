import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const signinSchema = z.strictObject({
    email: z.email(),
    password: z.string().min(1),
    deviceType: z.string().min(1).max(50).optional(),
    deviceName: z.string().min(1).max(100).optional(),
});

export type SigninInput = z.infer<typeof signinSchema>;

export class SigninDto extends createZodDto(signinSchema) {}
