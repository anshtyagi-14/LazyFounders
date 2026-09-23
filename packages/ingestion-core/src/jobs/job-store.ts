import type { Prisma, PrismaClient } from '@lazyfounders/database';
import type { SerializedError } from '../errors';
import type { Stage } from './stages';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'RETRY_PENDING' | 'DEAD_LETTER' | 'CANCELLED';

/** Payload every stage job carries. */
export interface JobEnvelope<P = Record<string, unknown>> {
  idempotencyKey: string;
  correlationId: string;
  stage: Stage;
  subjectType: string;
  subjectId: string;
  payload: P;
}

export interface JobRecord extends JobEnvelope {
  id: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  replayCount: number;
  lastError: SerializedError | null;
  nextRunAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface DeadLetterFilter {
  stage?: Stage;
  limit?: number;
  status?: JobStatus;
}

/** Durable job state. BullMQ only transports; this is what operators inspect and replay. */
export interface JobStore {
  /** Create the record if missing (idempotent). */
  ensure(env: JobEnvelope, opts: { maxAttempts: number; timeoutMs: number }): Promise<JobRecord>;
  get(idempotencyKey: string): Promise<JobRecord | null>;
  getById(id: string): Promise<JobRecord | null>;
  markRunning(idempotencyKey: string): Promise<JobRecord>;
  markSucceeded(idempotencyKey: string): Promise<void>;
  /** refundAttempt: the delivery did not count as an attempt (deferral, not failure). */
  markRetry(idempotencyKey: string, error: SerializedError, nextRunAt: Date, opts?: { refundAttempt?: boolean }): Promise<void>;
  markDeadLetter(idempotencyKey: string, error: SerializedError): Promise<void>;
  list(filter: DeadLetterFilter): Promise<JobRecord[]>;
  /** DEAD_LETTER -> QUEUED with attempts reset. Returns null if the job is not dead-lettered. */
  resetForReplay(id: string): Promise<JobRecord | null>;
}

type Row = Prisma.PipelineJobGetPayload<object>;

function toRecord(r: Row): JobRecord {
  return {
    id: r.id,
    idempotencyKey: r.idempotencyKey,
    correlationId: r.correlationId,
    stage: r.stage as Stage,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    payload: r.payload as Record<string, unknown>,
    status: r.status as JobStatus,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    timeoutMs: r.timeoutMs,
    replayCount: r.replayCount,
    lastError: (r.lastError as SerializedError | null) ?? null,
    nextRunAt: r.nextRunAt,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  };
}

export class PrismaJobStore implements JobStore {
  constructor(private readonly prisma: PrismaClient) {}

  async ensure(env: JobEnvelope, opts: { maxAttempts: number; timeoutMs: number }): Promise<JobRecord> {
    await this.prisma.pipelineJob.createMany({
      data: [
        {
          idempotencyKey: env.idempotencyKey,
          stage: env.stage,
          correlationId: env.correlationId,
          subjectType: env.subjectType,
          subjectId: env.subjectId,
          payload: env.payload as Prisma.InputJsonValue,
          maxAttempts: opts.maxAttempts,
          timeoutMs: opts.timeoutMs,
        },
      ],
      skipDuplicates: true,
    });
    return (await this.get(env.idempotencyKey))!;
  }

  async get(idempotencyKey: string): Promise<JobRecord | null> {
    const r = await this.prisma.pipelineJob.findUnique({ where: { idempotencyKey } });
    return r ? toRecord(r) : null;
  }

  async getById(id: string): Promise<JobRecord | null> {
    const r = await this.prisma.pipelineJob.findUnique({ where: { id } });
    return r ? toRecord(r) : null;
  }

  async markRunning(idempotencyKey: string): Promise<JobRecord> {
    const r = await this.prisma.pipelineJob.update({
      where: { idempotencyKey },
      data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date(), nextRunAt: null },
    });
    return toRecord(r);
  }

  async markSucceeded(idempotencyKey: string): Promise<void> {
    await this.prisma.pipelineJob.update({ where: { idempotencyKey }, data: { status: 'SUCCEEDED', completedAt: new Date() } });
  }

  async markRetry(idempotencyKey: string, error: SerializedError, nextRunAt: Date, opts: { refundAttempt?: boolean } = {}): Promise<void> {
    await this.prisma.pipelineJob.update({
      where: { idempotencyKey },
      data: {
        status: 'RETRY_PENDING',
        lastError: error as unknown as Prisma.InputJsonValue,
        nextRunAt,
        ...(opts.refundAttempt ? { attempts: { decrement: 1 } } : {}),
      },
    });
  }

  async markDeadLetter(idempotencyKey: string, error: SerializedError): Promise<void> {
    await this.prisma.pipelineJob.update({
      where: { idempotencyKey },
      data: { status: 'DEAD_LETTER', lastError: error as unknown as Prisma.InputJsonValue, completedAt: new Date() },
    });
  }

  async list(filter: DeadLetterFilter): Promise<JobRecord[]> {
    const rows = await this.prisma.pipelineJob.findMany({
      where: { status: filter.status ?? 'DEAD_LETTER', ...(filter.stage ? { stage: filter.stage } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(filter.limit ?? 100, 500),
    });
    return rows.map(toRecord);
  }

  async resetForReplay(id: string): Promise<JobRecord | null> {
    const res = await this.prisma.pipelineJob.updateMany({
      where: { id, status: 'DEAD_LETTER' },
      data: { status: 'QUEUED', attempts: 0, replayCount: { increment: 1 }, completedAt: null, nextRunAt: null },
    });
    if (res.count === 0) return null;
    return this.getById(id);
  }
}

/** In-memory JobStore for unit tests and dry runs. */
export class InMemoryJobStore implements JobStore {
  readonly jobs = new Map<string, JobRecord>();
  private seq = 0;

  async ensure(env: JobEnvelope, opts: { maxAttempts: number; timeoutMs: number }): Promise<JobRecord> {
    const existing = this.jobs.get(env.idempotencyKey);
    if (existing) return existing;
    const rec: JobRecord = {
      ...env,
      id: `job-${++this.seq}`,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: opts.maxAttempts,
      timeoutMs: opts.timeoutMs,
      replayCount: 0,
      lastError: null,
      nextRunAt: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };
    this.jobs.set(env.idempotencyKey, rec);
    return rec;
  }
  async get(key: string) {
    return this.jobs.get(key) ?? null;
  }
  async getById(id: string) {
    return [...this.jobs.values()].find((j) => j.id === id) ?? null;
  }
  private must(key: string): JobRecord {
    const j = this.jobs.get(key);
    if (!j) throw new Error(`job ${key} not found`);
    return j;
  }
  async markRunning(key: string) {
    const j = this.must(key);
    j.status = 'RUNNING';
    j.attempts++;
    j.startedAt = new Date();
    j.nextRunAt = null;
    return j;
  }
  async markSucceeded(key: string) {
    const j = this.must(key);
    j.status = 'SUCCEEDED';
    j.completedAt = new Date();
  }
  async markRetry(key: string, error: SerializedError, nextRunAt: Date, opts: { refundAttempt?: boolean } = {}) {
    const j = this.must(key);
    if (opts.refundAttempt) j.attempts--;
    j.status = 'RETRY_PENDING';
    j.lastError = error;
    j.nextRunAt = nextRunAt;
  }
  async markDeadLetter(key: string, error: SerializedError) {
    const j = this.must(key);
    j.status = 'DEAD_LETTER';
    j.lastError = error;
    j.completedAt = new Date();
  }
  async list(filter: DeadLetterFilter) {
    return [...this.jobs.values()].filter((j) => j.status === (filter.status ?? 'DEAD_LETTER') && (!filter.stage || j.stage === filter.stage));
  }
  async resetForReplay(id: string) {
    const j = await this.getById(id);
    if (!j || j.status !== 'DEAD_LETTER') return null;
    j.status = 'QUEUED';
    j.attempts = 0;
    j.replayCount++;
    j.completedAt = null;
    return j;
  }
}
