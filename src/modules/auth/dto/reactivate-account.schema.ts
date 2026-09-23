import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const reactivateAccountSchema = z.strictObject({
    email: z.email(),
    code: z.string().regex(/^\d{6}$/),
});

export type ReactivateAccountInput = z.infer<typeof reactivateAccountSchema>;

export class ReactivateAccountDto extends createZodDto(reactivateAccountSchema) {}
