import { Module } from "@nestjs/common";
import { ConsoleEmailSender } from "@/integrations/email/console-email.sender.js";
import { EMAIL_SENDER } from "@/integrations/email/email-sender.interface.js";

@Module({
    providers: [{ provide: EMAIL_SENDER, useClass: ConsoleEmailSender }],
    exports: [EMAIL_SENDER],
})
export class EmailModule {}
