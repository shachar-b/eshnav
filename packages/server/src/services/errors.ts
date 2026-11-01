import type { ApiErrorCode } from '@eshnav/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  INVALID_PIN: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class DomainError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}
