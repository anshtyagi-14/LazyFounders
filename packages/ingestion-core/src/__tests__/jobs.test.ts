import { describe, expect, it, vi } from 'vitest';
import { DeferredError, RetryableError, TerminalError } from '../errors';
import { DeadLetterService } from '../jobs/dlq';
import { backoffDelay, executeJob } from '../jobs/execute';
import { InMemoryJobStore, type JobEnvelope } from '../jobs/job-store';
import { InMemoryOutboxStore, OutboxDispatcher } from '../jobs/outbox';
import { STAGES, bullJobId } from '../jobs/stages';
import { InMemoryTransport } from '../jobs/transport';

const env = (key = 'article.scrape:fp1:first'): JobEnvelope => ({
  idempotencyKey: key,
  correlationId: 'corr-1',
  stage: STAGES.SCRAPE,
  subjectType: 'url_state',
  subjectId: 'u1',
  payload: { url: 'https://x.com/a' },
});

const noJitter = () => 0.5;

describe('queue jobs', () => {
  // Required test 13
  it('are idempotent: duplicate dispatch and redelivery run the handler once', async () => {
    const jobs = new InMemoryJobStore();
    const transport = new InMemoryTransport();
    const outbox = new InMemoryOutboxStore();
    expect(outbox.add({ ...env() })).toBe(true);
    expect(outbox.add({ ...env() })).toBe(false); // unique idempotency key
    const dispatcher = new OutboxDispatcher(outbox, jobs, transport);
    await dispatcher.dispatchOnce();
    await dispatcher.dispatchOnce();
    await transport.enqueue(env()); // a duplicate enqueue is dropped by jobId
    expect(transport.enqueued).toHaveLength(1);
    expect(jobs.jobs.size).toBe(1);
    expect(transport.enqueued[0].jobId).toBe(bullJobId(env().idempotencyKey));
    expect(transport.enqueued[0].jobId).not.toContain(':');

    const handler = vi.fn(async () => undefined);
    expect(await executeJob(env(), handler, { store: jobs })).toEqual({ kind: 'succeeded' });
    // At-least-once redelivery of the same job:
    expect(await executeJob(env(), handler, { store: jobs })).toEqual({ kind: 'skipped', reason: 'already_succeeded' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // Required test 14
  it('retryable errors back off exponentially with a cap', async () => {
    const policy = { baseMs: 1000, maxMs: 10_000, jitter: 0 };
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, policy))).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000]);
    const jittered = backoffDelay(3, { baseMs: 1000, maxMs: 60_000, jitter: 0.2 }, () => 0);
    expect(jittered).toBe(3200);

    const jobs = new InMemoryJobStore();
    const failing = vi.fn(async () => {
      throw new RetryableError('upstream 503', 'upstream_unavailable');
    });
    const deps = { store: jobs, backoff: { baseMs: 1000, maxMs: 60_000, jitter: 0 }, random: noJitter };
    const r1 = await executeJob(env(), failing, deps);
    const r2 = await executeJob(env(), failing, deps);
    expect(r1).toMatchObject({ kind: 'retry', delayMs: 1000 });
    expect(r2).toMatchObject({ kind: 'retry', delayMs: 2000 });
    const rec = await jobs.get(env().idempotencyKey);
    expect(rec).toMatchObject({ status: 'RETRY_PENDING', attempts: 2 });
    expect(rec?.lastError?.code).toBe('upstream_unavailable');
  });

  it('rate-limit deferrals do not consume attempts', async () => {
    const jobs = new InMemoryJobStore();
    const deferred = vi.fn(async () => {
      throw new DeferredError('rate limited', 3000);
    });
    for (let i = 0; i < 10; i++) expect(await executeJob(env(), deferred, { store: jobs })).toMatchObject({ kind: 'retry', delayMs: 3000 });
    expect((await jobs.get(env().idempotencyKey))?.attempts).toBe(0);
  });

  // Required test 15
  it('terminal failures dead-letter immediately; retryable ones stop at maxAttempts', async () => {
    const jobs = new InMemoryJobStore();
    const onDeadLetter = vi.fn();
    const terminal = vi.fn(async () => {
      throw new TerminalError('robots disallow', 'robots_disallowed');
    });
    expect(await executeJob(env('k-terminal'), terminal, { store: jobs, onDeadLetter })).toMatchObject({ kind: 'dead_letter' });
    expect(terminal).toHaveBeenCalledTimes(1);
    expect(onDeadLetter).toHaveBeenCalledTimes(1);
    // Further deliveries are ignored.
    expect(await executeJob(env('k-terminal'), terminal, { store: jobs })).toEqual({ kind: 'skipped', reason: 'dead_lettered' });

    const flaky = vi.fn(async () => {
      throw new Error('socket hang up'); // unknown errors are retryable but bounded
    });
    const outcomes = [];
    for (let i = 0; i < 10; i++) outcomes.push((await executeJob(env('k-flaky'), flaky, { store: jobs, random: noJitter })).kind);
    const max = (await jobs.get('k-flaky'))!.maxAttempts;
    expect(flaky).toHaveBeenCalledTimes(max);
    expect(outcomes.slice(0, max - 1).every((o) => o === 'retry')).toBe(true);
    expect(outcomes[max - 1]).toBe('dead_letter');
    expect(outcomes.slice(max).every((o) => o === 'skipped')).toBe(true);
  });

  it('times out hung handlers as a retryable error', async () => {
    process.env.JOB_TIMEOUT_MS_ARTICLE_SCRAPE = '50';
    try {
      const jobs = new InMemoryJobStore();
      const hung = () => new Promise<void>(() => undefined);
      const out = await executeJob(env('k-hung'), hung, { store: jobs });
      expect(out).toMatchObject({ kind: 'retry', error: { code: 'timeout' } });
    } finally {
      delete process.env.JOB_TIMEOUT_MS_ARTICLE_SCRAPE;
    }
  });

  // Required test 16
  it('dead-letter jobs can be inspected and safely replayed', async () => {
    const jobs = new InMemoryJobStore();
    const transport = new InMemoryTransport();
    const created: string[] = [];
    let broken = true;
    // Handler upserts on a natural key, like every real stage handler.
    const handler = vi.fn(async (e: JobEnvelope) => {
      if (broken) throw new TerminalError('parser bug', 'parse_error');
      if (!created.includes(e.subjectId)) created.push(e.subjectId);
    });
    await executeJob(env('k-dlq'), handler, { store: jobs });

    const dlq = new DeadLetterService(jobs, transport);
    const listed = await dlq.list({ stage: STAGES.SCRAPE });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ status: 'DEAD_LETTER', correlationId: 'corr-1', lastError: { code: 'parse_error', retryable: false } });

    broken = false; // bug fixed and deployed
    const replay = await dlq.replay(listed[0].id);
    expect(replay.replayed).toBe(true);
    expect(transport.enqueued[0].jobId).toBe(bullJobId('k-dlq', 1)); // fresh transport id, same idempotency key
    expect(transport.enqueued[0].envelope.idempotencyKey).toBe('k-dlq');

    expect(await executeJob(transport.enqueued[0].envelope, handler, { store: jobs })).toEqual({ kind: 'succeeded' });
    // Replaying again is refused: the job is no longer dead-lettered.
    expect(await dlq.replay(listed[0].id)).toMatchObject({ replayed: false, reason: 'not_dead_lettered' });
    // Redelivery of the replayed message does not duplicate work.
    await executeJob(transport.enqueued[0].envelope, handler, { store: jobs });
    expect(created).toEqual(['u1']);
    expect((await jobs.get('k-dlq'))?.replayCount).toBe(1);
  });
});
