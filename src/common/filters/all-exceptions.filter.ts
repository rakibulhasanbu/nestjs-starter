import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import type { ApiErrorResponse } from "@/common/types/api-response.type.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const body = this.buildErrorBody(exception);

        this.logger.error(
            `${request.method} ${request.url} ${body.statusCode} - ${
                exception instanceof Error ? exception.message : String(exception)
            }`,
            exception instanceof Error ? exception.stack : undefined,
        );

        response.status(body.statusCode).json(body);
    }

    private buildErrorBody(exception: unknown): ApiErrorResponse {
        if (exception instanceof ZodValidationException) {
            const zodError = exception.getZodError() as { issues?: ZodIssueLike[] } | undefined;
            const issues = zodError?.issues ?? [];

            return {
                statusCode: HttpStatus.BAD_REQUEST,
                code: "VALIDATION_ERROR",
                message: issues[0]?.message ?? "Validation failed",
                details: issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            };
        }

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            const isObject = typeof exceptionResponse === "object" && exceptionResponse !== null;
            const message = !isObject
                ? exceptionResponse
                : ((exceptionResponse as { message?: string | string[] }).message ?? exception.message);
            const code = isObject && (exceptionResponse as { code?: string }).code;

            return {
                statusCode: status,
                code: code || (HttpStatus[status] ?? "ERROR"),
                message: Array.isArray(message) ? message.join(", ") : message,
            };
        }

        return {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error",
        };
    }
}

interface ZodIssueLike {
    path: PropertyKey[];
    message: string;
}
