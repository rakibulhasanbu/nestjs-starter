import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "@/app.module.js";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter.js";
import { TransformResponseInterceptor } from "@/common/interceptors/transform-response.interceptor.js";
import { buildCorsOptions } from "@/config/cors.config.js";
import type { Env } from "@/config/env.schema.js";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const configService = app.get<ConfigService<Env, true>>(ConfigService);
    app.enableCors(buildCorsOptions(configService));

    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformResponseInterceptor());
    app.setGlobalPrefix("api");
    app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: "1",
    });

    await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
