/**
 * Typed application errors. Every module throws these instead of raw
 * strings/Errors so API responses can map consistently to HTTP status codes
 * and never leak internal detail to the client.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'Not allowed to perform this action'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static validation(message = 'Invalid input', details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }

  static conflict(message = 'Conflicting state'): AppError {
    return new AppError('CONFLICT', message);
  }

  static internal(message = 'Internal error'): AppError {
    return new AppError('INTERNAL_ERROR', message);
  }
}

/** Never echo raw internal error messages back to clients in production. */
export function toSafeMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return 'Ногаҳон хатогӣ рух дод. Лутфан баъдтар кӯшиш кунед.';
}
