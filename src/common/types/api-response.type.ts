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
    details?: unknown[];
}
