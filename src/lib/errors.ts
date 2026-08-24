/**
 * Typed application errors. Every module throws these instead of raw
 * strings/Errors so API responses can map consistently to HTTP status codes
 * and never leak internal detail to the client.
 */
import { t, type SupportedLanguage, type TranslationKey } from '../modules/i18n/i18n.service';
import type { TranslationParams } from '../modules/i18n/i18n.schema';

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

  /**
   * i18n-aware constructor: resolves `key` via the translation service for
   * `lang` and builds the AppError from the result. Purely additive — every
   * existing `AppError.xxx(message)` call site above is untouched and still
   * works exactly as before; this is an alternative entry point for new/
   * updated call sites that want a translated message.
   */
  static translated(
    code: ErrorCode,
    lang: SupportedLanguage,
    key: TranslationKey,
    params?: TranslationParams,
    details?: unknown,
  ): AppError {
    return new AppError(code, t(lang, key, params), details);
  }
}

/** Never echo raw internal error messages back to clients in production. */
export function toSafeMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return 'Ногаҳон хатогӣ рух дод. Лутфан баъдтар кӯшиш кунед.';
}
