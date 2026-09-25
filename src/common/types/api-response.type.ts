export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
}

export interface ApiSuccessResponse<T> {
    data: T;
    meta?: PaginationMeta;
}

export interface ApiErrorResponse {
    statusCode: number;
    code: string;
    message: string;
    /** Per-field validation failures. Only `VALIDATION_ERROR` sets this. */
    details?: unknown[];
    /**
     * Extra machine-readable context attached to a specific error code, passed
     * through from the thrown exception body — e.g. `ACCOUNT_PENDING_DELETION`
     * carries `graceEndsAt`. Read it only after narrowing on `code`.
     */
    [key: string]: unknown;
}
