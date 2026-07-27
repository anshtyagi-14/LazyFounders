export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata: Record<string, unknown>;

  constructor(message: string, code: string, statusCode = 500, isOperational = true, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class FetchError extends AppError {
  public readonly url: string;
  public readonly httpStatus: number | null;
  public readonly strategy: string;

  constructor(message: string, url: string, httpStatus: number | null, strategy: string, metadata: Record<string, unknown> = {}) {
    super(message, 'FETCH_ERROR', httpStatus || 500, true, { ...metadata, url, httpStatus, strategy });
    this.name = this.constructor.name;
    this.url = url;
    this.httpStatus = httpStatus;
    this.strategy = strategy;
  }
}

export class ParseError extends AppError {
  public readonly url: string;
  public readonly parserType: string;

  constructor(message: string, url: string, parserType: string, metadata: Record<string, unknown> = {}) {
    super(message, 'PARSE_ERROR', 500, true, { ...metadata, url, parserType });
    this.name = this.constructor.name;
    this.url = url;
    this.parserType = parserType;
  }
}

export class RateLimitError extends AppError {
  public readonly domain: string;
  public readonly retryAfterMs: number;

  constructor(message: string, domain: string, retryAfterMs: number, metadata: Record<string, unknown> = {}) {
    super(message, 'RATE_LIMIT_ERROR', 429, true, { ...metadata, domain, retryAfterMs });
    this.name = this.constructor.name;
    this.domain = domain;
    this.retryAfterMs = retryAfterMs;
  }
}

export class BotDetectionError extends AppError {
  public readonly url: string;
  public readonly detectionType: string;

  constructor(message: string, url: string, detectionType: string, metadata: Record<string, unknown> = {}) {
    super(message, 'BOT_DETECTION_ERROR', 403, true, { ...metadata, url, detectionType });
    this.name = this.constructor.name;
    this.url = url;
    this.detectionType = detectionType;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'VALIDATION_ERROR', 400, true, metadata);
    this.name = this.constructor.name;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'DATABASE_ERROR', 500, true, metadata);
    this.name = this.constructor.name;
  }
}

export class QueueError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'QUEUE_ERROR', 500, true, metadata);
    this.name = this.constructor.name;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'CONFIG_ERROR', 500, false, metadata);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, 'NOT_FOUND_ERROR', 404, true, metadata);
    this.name = this.constructor.name;
  }
}
