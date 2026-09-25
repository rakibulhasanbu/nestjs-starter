import { z } from "zod";
import { createZodDto } from "nestjs-zod";

/** Partial update: omitted channels keep their current value. */
export const updateNotificationPreferencesSchema = z.strictObject({
    loginEmailNotification: z.boolean().optional(),
    transactionsEmailNotification: z.boolean().optional(),
    transactionsPushNotification: z.boolean().optional(),
});

export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

export class UpdateNotificationPreferencesDto extends createZodDto(updateNotificationPreferencesSchema) {}
