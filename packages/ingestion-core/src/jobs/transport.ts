import { Queue, UnrecoverableError, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { JobEnvelope, JobStore } from './job-store';
import { bullJobId, queueName, stageSettings, type Stage } from './stages';
import { executeJob, type ExecuteDeps, type JobOutcome, type StageHandler } from './execute';

/** Moves envelopes to workers. BullMQ in production, in-memory in tests. */
export interface QueueTransport {
  enqueue(envelope: JobEnvelope, opts?: { replayCount?: number; delayMs?: number }): Promise<void>;
}

export const BULL_PREFIX = process.env.BULLMQ_PREFIX || 'lf';

export class BullTransport implements QueueTransport {
  private readonly queues = new Map<Stage, Queue>();

  constructor(private readonly connection: ConnectionOptions) {}

  private queue(stage: Stage): Queue {
    let q = this.queues.get(stage);
    if (!q) {
      q = new Queue(queueName(stage), { connection: this.connection, prefix: BULL_PREFIX });
      this.queues.set(stage, q);
    }
    return q;
  }

  async enqueue(envelope: JobEnvelope, opts: { replayCount?: number; delayMs?: number } = {}): Promise<void> {
    const settings = stageSettings(envelope.stage);
    await this.queue(envelope.stage).add(envelope.stage, envelope, {
      // Same idempotency key => same BullMQ id => BullMQ drops duplicate adds.
      jobId: bullJobId(envelope.idempotencyKey, opts.replayCount ?? 0),
      delay: opts.delayMs,
      // PipelineJob decides when to give up (deferrals do not count as attempts), so
      // BullMQ's own limit is only a runaway guard and must never be reached first.
      attempts: Math.max(100, settings.maxAttempts * 10),
      backoff: { type: 'pipeline' },
      removeOnComplete: { age: 24 * 3600, count: 10_000 },
      removeOnFail: { age: 14 * 24 * 3600 },
    });
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  async counts(): Promise<Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [stage, q] of this.queues) out[stage] = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    return out;
  }
}

export interface StageWorkerOptions extends ExecuteDeps {
  stage: Stage;
  handler: StageHandler<any>;
  connection: ConnectionOptions;
  concurrency?: number;
  onOutcome?: (stage: Stage, outcome: JobOutcome, durationMs: number, job: Job) => void;
}

/**
 * BullMQ worker for one stage. Scale horizontally with replicas and vertically with
 * WORKER_CONCURRENCY_<STAGE>; there is no fixed worker count anywhere.
 */
export function startStageWorker(opts: StageWorkerOptions): Worker {
  const settings = stageSettings(opts.stage);
  const worker = new Worker(
    queueName(opts.stage),
    async (job: Job<JobEnvelope>) => {
      const t0 = Date.now();
      const outcome = await executeJob(job.data, opts.handler, opts);
      opts.onOutcome?.(opts.stage, outcome, Date.now() - t0, job);
      if (outcome.kind === 'retry') {
        throw Object.assign(new Error(outcome.error.message), { delayMs: outcome.delayMs });
      }
      if (outcome.kind === 'dead_letter') throw new UnrecoverableError(outcome.error.message);
      return outcome;
    },
    {
      connection: opts.connection,
      prefix: BULL_PREFIX,
      concurrency: opts.concurrency ?? settings.concurrency,
      // Use the delay computed by executeJob (which also recorded it in PipelineJob.nextRunAt).
      settings: {
        backoffStrategy: (_attempts: number, _type?: string, err?: Error) => (err as { delayMs?: number } | undefined)?.delayMs ?? 5_000,
      },
    },
  );
  return worker;
}

/** In-memory transport: records enqueued envelopes (tests / dry runs). */
export class InMemoryTransport implements QueueTransport {
  readonly enqueued: Array<{ envelope: JobEnvelope; jobId: string }> = [];
  private readonly ids = new Set<string>();

  async enqueue(envelope: JobEnvelope, opts: { replayCount?: number } = {}): Promise<void> {
    const jobId = bullJobId(envelope.idempotencyKey, opts.replayCount ?? 0);
    if (this.ids.has(jobId)) return;
    this.ids.add(jobId);
    this.enqueued.push({ envelope, jobId });
  }

  drain(): JobEnvelope[] {
    return this.enqueued.splice(0).map((e) => e.envelope);
  }
}

export type { JobStore };
