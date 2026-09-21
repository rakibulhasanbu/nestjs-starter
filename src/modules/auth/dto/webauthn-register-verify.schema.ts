import { z } from "zod";
import { createZodDto } from "nestjs-zod";

// RegistrationResponseJSON shape is defined and deep-validated by @simplewebauthn/server
// itself (verifyRegistrationResponse throws on malformed input) — re-declaring its full
// nested structure here would just duplicate that validation and drift from the library.
export const webauthnRegisterVerifySchema = z.strictObject({
    credential: z.looseObject({}),
    deviceName: z.string().min(1).max(100).optional(),
});

export type WebauthnRegisterVerifyInput = z.infer<typeof webauthnRegisterVerifySchema>;

export class WebauthnRegisterVerifyDto extends createZodDto(webauthnRegisterVerifySchema) {}
