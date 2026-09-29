export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static unauthorized(message = "Authentication required") {
    return new AppError("UNAUTHORIZED", message);
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new AppError("FORBIDDEN", message);
  }
  static notFound(entity = "Resource") {
    return new AppError("NOT_FOUND", `${entity} not found`);
  }
  static validation(message: string, details?: unknown) {
    return new AppError("VALIDATION_ERROR", message, details);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError("CONFLICT", message, details);
  }
  static badRequest(message: string, details?: unknown) {
    return new AppError("BAD_REQUEST", message, details);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
