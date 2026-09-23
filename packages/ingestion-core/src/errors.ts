/**
 * Error taxonomy for pipeline jobs. The stage worker only looks at `retryable`:
 *  - RetryableError  -> bounded exponential backoff, then DEAD_LETTER.
 *  - TerminalError   -> DEAD_LETTER immediately (or a business outcome such as NEEDS_REVIEW).
 * Blocked sites (robots, 401/403 bot walls, CAPTCHA, paywall) are terminal on purpose:
 * we never escalate to evasion techniques.
 */
export abstract class PipelineError extends Error {
  abstract readonly retryable: boolean;
  constructor(message: string, readonly code: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
  }
}

export class RetryableError extends PipelineError {
  readonly retryable = true;
}

export class TerminalError extends PipelineError {
  readonly retryable = false;
}

/**
 * Not a failure: the work must wait (per-domain rate limit, crawl-delay). The job is
 * re-scheduled after `deferMs` without consuming a retry attempt.
 */
export class DeferredError extends PipelineError {
  readonly retryable = true;
  constructor(message: string, readonly deferMs: number) {
    super(message, 'deferred', { deferMs });
  }
}

export class BlockedError extends TerminalError {
  constructor(message: string, code: 'robots_disallowed' | 'http_blocked' | 'captcha' | 'paywall' | 'access_restricted', details?: Record<string, unknown>) {
    super(message, code, details);
  }
}

export class SsrfError extends TerminalError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ssrf_blocked', details);
  }
}

export interface SerializedError {
  name: string;
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  at: string;
}

/** Classify any thrown value. Unknown errors are retryable (bounded), never infinite. */
export function isRetryable(err: unknown): boolean {
  if (err && typeof err === 'object' && 'retryable' in err) return Boolean((err as { retryable: unknown }).retryable);
  return true;
}

export function serializeError(err: unknown): SerializedError {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    name: e.name,
    code: (e as Partial<PipelineError>).code ?? 'unknown',
    // Messages are truncated so copyrighted body text or secrets never reach logs/DB via errors.
    message: e.message.slice(0, 500),
    retryable: isRetryable(err),
    details: (e as Partial<PipelineError>).details,
    at: new Date().toISOString(),
  };
}
