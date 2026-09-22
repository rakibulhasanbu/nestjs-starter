import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const webauthnLoginUsernamelessVerifySchema = z.strictObject({
    credential: z.looseObject({}),
});

export type WebauthnLoginUsernamelessVerifyInput = z.infer<typeof webauthnLoginUsernamelessVerifySchema>;

export class WebauthnLoginUsernamelessVerifyDto extends createZodDto(webauthnLoginUsernamelessVerifySchema) {}
