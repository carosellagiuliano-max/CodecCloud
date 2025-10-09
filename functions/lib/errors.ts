import { randomUUID } from 'node:crypto';
import type { ZodError } from 'zod';
import { ProblemDetailSchema, type ProblemDetail } from '../../packages/types/contracts';

export type HttpResponse<T = unknown> = {
  status: number;
  body: T;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly detail?: string;
  public readonly causeError?: Error;

  constructor({
    status,
    type,
    title,
    detail,
    cause
  }: {
    status: number;
    type: string;
    title: string;
    detail?: string;
    cause?: Error;
  }) {
    super(title);
    this.status = status;
    this.type = type;
    this.detail = detail;
    this.causeError = cause;
  }
}

export class ValidationProblem extends ApiError {
  public readonly errors: ProblemDetail['errors'];

  constructor(zodError: ZodError) {
    super({
      status: 422,
      type: 'https://codeccloud.ch/problems/validation-error',
      title: 'Validation failed',
      detail: 'The request payload did not satisfy the schema.'
    });
    this.errors = zodError.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message
    }));
  }
}

export class UnauthorizedError extends ApiError {
  constructor(detail = 'Authentication required.') {
    super({
      status: 401,
      type: 'https://codeccloud.ch/problems/unauthorized',
      title: 'Unauthorized',
      detail
    });
  }
}

export class ForbiddenError extends ApiError {
  constructor(detail = 'You do not have permission to perform this action.') {
    super({
      status: 403,
      type: 'https://codeccloud.ch/problems/forbidden',
      title: 'Forbidden',
      detail
    });
  }
}

export class ConflictError extends ApiError {
  constructor(detail = 'The requested operation conflicts with the current state.') {
    super({
      status: 409,
      type: 'https://codeccloud.ch/problems/conflict',
      title: 'Conflict',
      detail
    });
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter: number;

  constructor({ detail, retryAfter }: { detail: string; retryAfter: number }) {
    super({
      status: 429,
      type: 'https://codeccloud.ch/problems/rate-limited',
      title: 'Rate limit exceeded',
      detail
    });
    this.retryAfter = retryAfter;
  }
}

export class IdempotencyKeyConflictError extends ApiError {
  constructor() {
    super({
      status: 409,
      type: 'https://codeccloud.ch/problems/idempotency-conflict',
      title: 'Idempotency key conflict',
      detail: 'The Idempotency-Key was reused with a different request payload.'
    });
  }
}

export class BadRequestError extends ApiError {
  constructor(detail: string) {
    super({
      status: 400,
      type: 'https://codeccloud.ch/problems/bad-request',
      title: 'Bad request',
      detail
    });
  }
}

export const toProblem = (
  error: unknown,
  requestId?: string
): HttpResponse<ProblemDetail> => {
  const id = requestId ?? randomUUID();
  if (error instanceof ValidationProblem) {
    return {
      status: error.status,
      headers: {
        'content-type': 'application/problem+json',
        'x-request-id': id
      },
      body: {
        type: error.type,
        title: error.message,
        status: error.status,
        detail: error.detail,
        requestId: id,
        errors: error.errors
      }
    };
  }

  if (error instanceof ApiError) {
    return {
      status: error.status,
      headers: {
        'content-type': 'application/problem+json',
        'x-request-id': id
      },
      body: {
        type: error.type,
        title: error.message,
        status: error.status,
        detail: error.detail,
        requestId: id
      }
    };
  }

  const internalDetail = error instanceof Error ? error.message : 'Unknown error.';

  return {
    status: 500,
    headers: {
      'content-type': 'application/problem+json',
      'x-request-id': id
    },
    body: {
      type: 'https://codeccloud.ch/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: internalDetail,
      requestId: id
    }
  };
};

export const respond = <T>(
  body: T,
  status = 200,
  headers: Record<string, string> = {}
): HttpResponse<T> => ({
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  },
  body
});

export const parseProblem = (value: unknown): ProblemDetail => {
  const result = ProblemDetailSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Invalid problem detail payload.');
  }
  return result.data;
};
