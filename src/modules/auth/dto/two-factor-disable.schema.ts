import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const twoFactorDisableSchema = z.strictObject({
    password: z.string().min(1),
    code: z.string().regex(/^\d{6}$/),
});

export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;

export class TwoFactorDisableDto extends createZodDto(twoFactorDisableSchema) {}
