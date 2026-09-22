import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const verifyEmailSchema = z.strictObject({
    email: z.email(),
    code: z.string().regex(/^\d{6}$/),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}

export const resendVerificationSchema = z.strictObject({
    email: z.email(),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export class ResendVerificationDto extends createZodDto(resendVerificationSchema) {}
