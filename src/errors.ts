/** LoftBox SDK 예외. */

export class LoftBoxError extends Error {
  readonly statusCode?: number;
  readonly body?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    opts: { statusCode?: number; body?: unknown; requestId?: string } = {},
  ) {
    super(message);
    // 하위 타깃 트랜스파일에서도 instanceof 가 동작하도록 prototype 복원.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "LoftBoxError";
    this.statusCode = opts.statusCode;
    this.body = opts.body;
    this.requestId = opts.requestId;
  }
}

/** 401 — API 키 없음/유효하지 않음. */
export class AuthenticationError extends LoftBoxError {
  constructor(...args: ConstructorParameters<typeof LoftBoxError>) {
    super(...args);
    this.name = "AuthenticationError";
  }
}

/** 403 — scope 부족. */
export class PermissionError extends LoftBoxError {
  constructor(...args: ConstructorParameters<typeof LoftBoxError>) {
    super(...args);
    this.name = "PermissionError";
  }
}

/** 404 — 리소스 없음. */
export class NotFoundError extends LoftBoxError {
  constructor(...args: ConstructorParameters<typeof LoftBoxError>) {
    super(...args);
    this.name = "NotFoundError";
  }
}

/** 409 — 멱등/상태 충돌. */
export class ConflictError extends LoftBoxError {
  constructor(...args: ConstructorParameters<typeof LoftBoxError>) {
    super(...args);
    this.name = "ConflictError";
  }
}

/** 400 / 422 — 요청 검증 실패. */
export class ValidationError extends LoftBoxError {
  constructor(...args: ConstructorParameters<typeof LoftBoxError>) {
    super(...args);
    this.name = "ValidationError";
  }
}

/** 429 — rate limit 초과. retryAfterSecs 만큼 대기 후 재시도. */
export class RateLimitError extends LoftBoxError {
  readonly retryAfterSecs?: number;
  constructor(
    message: string,
    opts: {
      statusCode?: number;
      body?: unknown;
      requestId?: string;
      retryAfterSecs?: number;
    } = {},
  ) {
    super(message, opts);
    this.name = "RateLimitError";
    this.retryAfterSecs = opts.retryAfterSecs;
  }
}

export function errorForStatus(
  statusCode: number,
  message: string,
  opts: { body?: unknown; requestId?: string; retryAfterSecs?: number } = {},
): LoftBoxError {
  const base = { statusCode, body: opts.body, requestId: opts.requestId };
  switch (statusCode) {
    case 400:
    case 422:
      return new ValidationError(message, base);
    case 401:
      return new AuthenticationError(message, base);
    case 403:
      return new PermissionError(message, base);
    case 404:
      return new NotFoundError(message, base);
    case 409:
      return new ConflictError(message, base);
    case 429:
      return new RateLimitError(message, {
        ...base,
        retryAfterSecs: opts.retryAfterSecs,
      });
    default:
      return new LoftBoxError(message, base);
  }
}
