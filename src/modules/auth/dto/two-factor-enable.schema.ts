import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const twoFactorEnableSchema = z.strictObject({
    code: z.string().regex(/^\d{6}$/),
});

export type TwoFactorEnableInput = z.infer<typeof twoFactorEnableSchema>;

export class TwoFactorEnableDto extends createZodDto(twoFactorEnableSchema) {}
