import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "@/app.module.js";
import { configureApp } from "@/config/configure-app.js";

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    configureApp(app);

    await app.listen(process.env.PORT ?? 3000);
}

// A rejected bootstrap must not become an unhandled rejection: without this the
// process dies with no usable message and a non-zero-but-unexplained exit.
bootstrap().catch((error: unknown) => {
    Logger.error(error instanceof Error ? error.stack : String(error), "Bootstrap");
    process.exit(1);
});
