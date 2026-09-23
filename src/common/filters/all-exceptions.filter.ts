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
import { Prisma } from "@/database/generated/prisma/client.js";
import type { ApiErrorResponse } from "@/common/types/api-response.type.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const body = this.buildErrorBody(exception);

        const message = `${request.method} ${request.url} ${body.statusCode} - ${
            exception instanceof Error ? exception.message : String(exception)
        }`;

        // 4xx is the client saying something wrong, not the server breaking. A
        // stack trace per bad password or missing row buries the 5xx that matter
        // and costs real money in log ingestion.
        if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
            this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
        } else {
            this.logger.warn(message);
        }

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

        if (exception instanceof Prisma.PrismaClientKnownRequestError) {
            return this.buildPrismaErrorBody(exception);
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

    /**
     * Prisma's errors are not HttpExceptions, so without this a taken username or
     * a duplicate email surfaced as a 500 that told the client nothing. Only the
     * constraint violations a caller can actually act on are translated; anything
     * else stays a generic 500 rather than leaking schema internals.
     */
    private buildPrismaErrorBody(exception: Prisma.PrismaClientKnownRequestError): ApiErrorResponse {
        switch (exception.code) {
            case "P2002":
                return {
                    statusCode: HttpStatus.CONFLICT,
                    code: "UNIQUE_CONSTRAINT_VIOLATION",
                    message: describeUniqueTarget(exception.meta?.target),
                };
            case "P2025":
                return {
                    statusCode: HttpStatus.NOT_FOUND,
                    code: "NOT_FOUND",
                    message: "The requested record no longer exists",
                };
            case "P2003":
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    code: "FOREIGN_KEY_CONSTRAINT_VIOLATION",
                    message: "A referenced record does not exist",
                };
            default:
                return {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Internal server error",
                };
        }
    }
}

/** `meta.target` carries the offending column(s) — a string or an array, depending on the driver. */
function describeUniqueTarget(target: unknown): string {
    const fields = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];

    return fields.length > 0
        ? `A record with this ${fields.join(", ")} already exists`
        : "A record with these details already exists";
}

interface ZodIssueLike {
    path: PropertyKey[];
    message: string;
}
