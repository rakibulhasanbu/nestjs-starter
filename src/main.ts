import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter.js";
import { TransformResponseInterceptor } from "@/common/interceptors/transform-response.interceptor.js";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

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
