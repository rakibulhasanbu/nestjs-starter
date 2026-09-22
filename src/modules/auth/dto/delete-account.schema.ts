import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const deleteAccountSchema = z.strictObject({
    code: z.string().regex(/^\d{6}$/),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}
