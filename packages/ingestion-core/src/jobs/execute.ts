import { DeferredError, RetryableError, isRetryable, serializeError, type SerializedError } from '../errors';
import type { JobEnvelope, JobRecord, JobStore } from './job-store';
import { stageSettings } from './stages';

export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
  /** 0..1 fraction of the delay randomised to avoid thundering herds. */
  jitter: number;
}

export function defaultBackoff(env: NodeJS.ProcessEnv = process.env): BackoffPolicy {
  return {
    baseMs: Number(env.JOB_BACKOFF_BASE_MS || 5_000),
    maxMs: Number(env.JOB_BACKOFF_MAX_MS || 30 * 60_000),
    jitter: 0.2,
  };
}

/** Delay before retry number `attempt` (1-based): base * 2^(attempt-1), capped, with jitter. */
export function backoffDelay(attempt: number, policy: BackoffPolicy, random: () => number = Math.random): number {
  const exp = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, attempt - 1));
  const spread = exp * policy.jitter;
  return Math.round(Math.min(policy.maxMs, exp - spread + random() * 2 * spread));
}

export interface HandlerContext {
  job: JobRecord;
  signal: AbortSignal;
}

export type StageHandler<P = Record<string, unknown>> = (envelope: JobEnvelope<P>, ctx: HandlerContext) => Promise<void>;

export type JobOutcome =
  | { kind: 'succeeded' }
  | { kind: 'skipped'; reason: 'already_succeeded' | 'dead_lettered' | 'cancelled' }
  | { kind: 'retry'; delayMs: number; error: SerializedError }
  | { kind: 'dead_letter'; error: SerializedError };

export interface ExecuteDeps {
  store: JobStore;
  backoff?: BackoffPolicy;
  random?: () => number;
  onDeadLetter?: (job: JobRecord, error: SerializedError) => Promise<void> | void;
}

/**
 * Run one delivery of a job. Transport-agnostic (the BullMQ worker maps the outcome to
 * complete / retry / fail). Guarantees:
 *  - A job that already SUCCEEDED is never re-executed (at-least-once delivery becomes
 *    effectively-once; handlers are additionally idempotent).
 *  - A DEAD_LETTER job only runs again through an explicit replay.
 *  - Retryable errors back off exponentially up to maxAttempts; terminal errors and
 *    exhausted retries dead-letter immediately. Nothing retries forever.
 */
export async function executeJob(envelope: JobEnvelope, handler: StageHandler, deps: ExecuteDeps): Promise<JobOutcome> {
  const settings = stageSettings(envelope.stage);
  const existing = (await deps.store.get(envelope.idempotencyKey)) ?? (await deps.store.ensure(envelope, settings));
  if (existing.status === 'SUCCEEDED') return { kind: 'skipped', reason: 'already_succeeded' };
  if (existing.status === 'DEAD_LETTER') return { kind: 'skipped', reason: 'dead_lettered' };
  if (existing.status === 'CANCELLED') return { kind: 'skipped', reason: 'cancelled' };

  const job = await deps.store.markRunning(envelope.idempotencyKey);
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      handler(envelope, { job, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RetryableError(`Stage ${envelope.stage} timed out after ${job.timeoutMs}ms`, 'timeout'));
        }, job.timeoutMs);
      }),
    ]);
    await deps.store.markSucceeded(envelope.idempotencyKey);
    return { kind: 'succeeded' };
  } catch (err) {
    const error = serializeError(err);
    if (err instanceof DeferredError) {
      await deps.store.markRetry(envelope.idempotencyKey, error, new Date(Date.now() + err.deferMs), { refundAttempt: true });
      return { kind: 'retry', delayMs: err.deferMs, error };
    }
    if (!isRetryable(err) || job.attempts >= job.maxAttempts) {
      await deps.store.markDeadLetter(envelope.idempotencyKey, error);
      await deps.onDeadLetter?.(job, error);
      return { kind: 'dead_letter', error };
    }
    const delayMs = backoffDelay(job.attempts, deps.backoff ?? defaultBackoff(), deps.random);
    await deps.store.markRetry(envelope.idempotencyKey, error, new Date(Date.now() + delayMs));
    return { kind: 'retry', delayMs, error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
