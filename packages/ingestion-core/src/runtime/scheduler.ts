import type { PrismaClient } from '@lazyfounders/database';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';

/**
 * Emits discover.source events for sources that are due. Safe to run in every replica:
 * the event key contains the source id and the current interval slot, so N schedulers
 * produce one event per source per interval (unique OutboxEvent key), and the scan
 * itself is additionally protected by the per-source distributed lock.
 */
export class DiscoveryScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: { tickMs?: number; onError?: (err: unknown) => void; onScheduled?: (sourceId: string) => void } = {},
  ) {}

  /** Returns the number of scans scheduled in this tick. */
  async tick(now = new Date()): Promise<number> {
    const sources = await this.prisma.source.findMany({
      where: { enabled: true, trustStatus: 'APPROVED', registryKey: { not: null } },
      select: { id: true, crawlIntervalMinutes: true, lastCrawledAt: true },
    });
    let scheduled = 0;
    for (const s of sources) {
      const intervalMs = Math.max(5, s.crawlIntervalMinutes) * 60_000;
      if (s.lastCrawledAt && now.getTime() - s.lastCrawledAt.getTime() < intervalMs) continue;
      const slot = Math.floor(now.getTime() / intervalMs);
      const created = await this.prisma.$transaction((tx) =>
        emitEvent(tx, {
          stage: STAGES.DISCOVER,
          idempotencyKey: `${STAGES.DISCOVER}:${s.id}:${slot}`,
          correlationId: `scan:${s.id}:${slot}`,
          subjectType: 'source',
          subjectId: s.id,
          payload: { sourceId: s.id },
        }),
      );
      if (created) {
        scheduled++;
        this.opts.onScheduled?.(s.id);
      }
    }
    return scheduled;
  }

  /** Manual scan (admin "scan now"): unique per request. */
  async trigger(sourceId: string, requestedBy: string): Promise<void> {
    const at = Date.now();
    await this.prisma.$transaction((tx) =>
      emitEvent(tx, {
        stage: STAGES.DISCOVER,
        idempotencyKey: `${STAGES.DISCOVER}:${sourceId}:manual:${at}`,
        correlationId: `scan:${sourceId}:manual:${at}`,
        subjectType: 'source',
        subjectId: sourceId,
        payload: { sourceId, requestedBy },
      }),
    );
  }

  start(): void {
    const run = () => this.tick().catch((err) => this.opts.onError?.(err));
    this.timer = setInterval(run, this.opts.tickMs ?? Number(process.env.SCHEDULER_TICK_MS || 60_000));
    void run();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
