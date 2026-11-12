import type { ApiErrorCode } from "@/lib/search/types";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_query: 400,
  not_found: 404,
  gone: 410,
  internal: 500,
};

/** Expected failures of catalogue/search use cases; route handlers turn them into typed JSON errors. */
export class CatalogueError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "CatalogueError";
    this.code = code;
    this.status = STATUS[code];
  }
}
