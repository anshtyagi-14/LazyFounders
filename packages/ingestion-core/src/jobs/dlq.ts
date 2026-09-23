import type { DeadLetterFilter, JobRecord, JobStore } from './job-store';
import type { QueueTransport } from './transport';

export interface ReplayResult {
  replayed: boolean;
  job: JobRecord | null;
  reason?: 'not_found' | 'not_dead_lettered';
}

/**
 * Dead-letter inspection and replay. Replay re-queues the SAME idempotency key (with a
 * fresh transport id), so handlers - which upsert on natural keys - cannot create
 * duplicate articles or publications when a job is replayed.
 */
export class DeadLetterService {
  constructor(private readonly jobs: JobStore, private readonly transport: QueueTransport) {}

  list(filter: DeadLetterFilter = {}): Promise<JobRecord[]> {
    return this.jobs.list({ ...filter, status: filter.status ?? 'DEAD_LETTER' });
  }

  get(id: string): Promise<JobRecord | null> {
    return this.jobs.getById(id);
  }

  async replay(id: string): Promise<ReplayResult> {
    const current = await this.jobs.getById(id);
    if (!current) return { replayed: false, job: null, reason: 'not_found' };
    const job = await this.jobs.resetForReplay(id);
    if (!job) return { replayed: false, job: current, reason: 'not_dead_lettered' };
    await this.transport.enqueue(
      {
        idempotencyKey: job.idempotencyKey,
        correlationId: job.correlationId,
        stage: job.stage,
        subjectType: job.subjectType,
        subjectId: job.subjectId,
        payload: job.payload,
      },
      { replayCount: job.replayCount },
    );
    return { replayed: true, job };
  }
}
