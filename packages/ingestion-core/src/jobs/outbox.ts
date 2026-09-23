import type { Prisma, PrismaClient, Tx } from '@lazyfounders/database';
import type { JobEnvelope, JobStore } from './job-store';
import { stageSettings, type Stage } from './stages';
import type { QueueTransport } from './transport';

export interface NewOutboxEvent {
  stage: Stage;
  idempotencyKey: string;
  correlationId: string;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/**
 * Write the next stage's event inside the caller's transaction, so "state changed" and
 * "next job requested" commit or roll back together. Duplicate keys are ignored.
 */
export async function emitEvent(tx: Tx, event: NewOutboxEvent): Promise<boolean> {
  const res = await tx.outboxEvent.createMany({
    data: [{ ...event, payload: event.payload as Prisma.InputJsonValue }],
    skipDuplicates: true,
  });
  return res.count > 0;
}

export interface OutboxStore {
  /** Claim undispatched events and run `dispatch` for them; marks successes as dispatched. */
  withBatch(limit: number, dispatch: (events: NewOutboxEvent[]) => Promise<Set<string>>): Promise<number>;
}

export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: PrismaClient) {}

  async withBatch(limit: number, dispatch: (events: NewOutboxEvent[]) => Promise<Set<string>>): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        // SKIP LOCKED lets several dispatchers (one per service replica) run side by side.
        const rows = await tx.$queryRaw<Array<{ id: string; stage: string; idempotency_key: string; correlation_id: string; subject_type: string; subject_id: string; payload: unknown }>>`
          SELECT id, stage, idempotency_key, correlation_id, subject_type, subject_id, payload
          FROM outbox_events
          WHERE dispatched_at IS NULL
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return 0;
        const events = rows.map((r) => ({
          stage: r.stage as Stage,
          idempotencyKey: r.idempotency_key,
          correlationId: r.correlation_id,
          subjectType: r.subject_type,
          subjectId: r.subject_id,
          payload: r.payload as Record<string, unknown>,
        }));
        const ok = await dispatch(events);
        const done = rows.filter((r) => ok.has(r.idempotency_key)).map((r) => r.id);
        const failed = rows.filter((r) => !ok.has(r.idempotency_key)).map((r) => r.id);
        if (done.length) await tx.outboxEvent.updateMany({ where: { id: { in: done } }, data: { dispatchedAt: new Date() } });
        if (failed.length) await tx.outboxEvent.updateMany({ where: { id: { in: failed } }, data: { attempts: { increment: 1 } } });
        return done.length;
      },
      { timeout: 30_000 },
    );
  }
}

export class InMemoryOutboxStore implements OutboxStore {
  readonly events: Array<NewOutboxEvent & { dispatched: boolean }> = [];

  add(e: NewOutboxEvent): boolean {
    if (this.events.some((x) => x.idempotencyKey === e.idempotencyKey)) return false;
    this.events.push({ ...e, dispatched: false });
    return true;
  }

  async withBatch(limit: number, dispatch: (events: NewOutboxEvent[]) => Promise<Set<string>>): Promise<number> {
    const batch = this.events.filter((e) => !e.dispatched).slice(0, limit);
    if (!batch.length) return 0;
    const ok = await dispatch(batch);
    for (const e of batch) if (ok.has(e.idempotencyKey)) e.dispatched = true;
    return ok.size;
  }
}

/** Moves committed outbox events onto the queue and registers their durable job record. */
export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly outbox: OutboxStore,
    private readonly jobs: JobStore,
    private readonly transport: QueueTransport,
    private readonly opts: { batchSize?: number; intervalMs?: number; onError?: (err: unknown) => void } = {},
  ) {}

  async dispatchOnce(): Promise<number> {
    return this.outbox.withBatch(this.opts.batchSize ?? 100, async (events) => {
      const ok = new Set<string>();
      for (const e of events) {
        try {
          const envelope: JobEnvelope = e;
          await this.jobs.ensure(envelope, stageSettings(e.stage));
          await this.transport.enqueue(envelope);
          ok.add(e.idempotencyKey);
        } catch (err) {
          this.opts.onError?.(err);
        }
      }
      return ok;
    });
  }

  start(): void {
    const interval = this.opts.intervalMs ?? Number(process.env.OUTBOX_POLL_MS || 1_000);
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        // Drain quickly when there is a backlog, then fall back to polling.
        while ((await this.dispatchOnce()) > 0) {
          /* keep draining */
        }
      } catch (err) {
        this.opts.onError?.(err);
      } finally {
        this.running = false;
      }
    };
    this.timer = setInterval(tick, interval);
    void tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
