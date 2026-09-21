import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { UserStatus } from "@/database/generated/prisma/enums.js";

export const updateStatusSchema = z.strictObject({
    status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED]),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export class UpdateStatusDto extends createZodDto(updateStatusSchema) {}
