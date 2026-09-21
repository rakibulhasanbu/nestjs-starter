import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { ApiSuccessResponse } from "@/common/types/api-response.type.js";

function hasDataKey(value: unknown): value is ApiSuccessResponse<unknown> {
    return typeof value === "object" && value !== null && "data" in value;
}

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiSuccessResponse<unknown>> {
        return next.handle().pipe(
            map((value: unknown) => (hasDataKey(value) ? value : { data: value })),
        );
    }
}
