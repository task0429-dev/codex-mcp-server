type ToolErrorCode =
  | "bad_request"
  | "permission_denied"
  | "not_found"
  | "disabled"
  | "dependency_missing"
  | "runtime_error";

export class ToolError extends Error {
  code: ToolErrorCode;
  statusCode: number;
  details?: unknown;

  constructor(message: string, options?: { code?: ToolErrorCode; statusCode?: number; details?: unknown }) {
    super(message);
    this.name = "ToolError";
    this.code = options?.code || "runtime_error";
    this.statusCode = options?.statusCode || 500;
    this.details = options?.details;
  }
}

export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error) {
    return new ToolError(error.message);
  }

  return new ToolError(String(error));
}

export function assertCondition(condition: unknown, message: string, options?: { code?: ToolErrorCode; statusCode?: number; details?: unknown }): asserts condition {
  if (!condition) {
    throw new ToolError(message, options);
  }
}
