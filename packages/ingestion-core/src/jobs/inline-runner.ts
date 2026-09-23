import type { PrismaClient } from '@lazyfounders/database';
import { executeJob, type JobOutcome, type StageHandler } from './execute';
import { PrismaJobStore, type JobEnvelope } from './job-store';
import { OutboxDispatcher, PrismaOutboxStore } from './outbox';
import type { Stage } from './stages';
import { InMemoryTransport } from './transport';

export interface InlineRunResult {
  executed: Array<{ stage: Stage; key: string; outcome: JobOutcome }>;
}

/**
 * Runs the pipeline in-process: outbox -> PipelineJob -> handler, until the outbox is
 * empty. Same code path as the BullMQ workers minus Redis; used by the end-to-end tests
 * and by `pipeline:smoke`. Retries are executed immediately (delays are ignored).
 */
export async function runPipelineInline(
  prisma: PrismaClient,
  handlers: Partial<Record<Stage, StageHandler<any>>>,
  opts: { maxRounds?: number; maxRetriesPerJob?: number; stopAt?: Stage[] } = {},
): Promise<InlineRunResult> {
  const jobs = new PrismaJobStore(prisma);
  const transport = new InMemoryTransport();
  const dispatcher = new OutboxDispatcher(new PrismaOutboxStore(prisma), jobs, transport);
  const executed: InlineRunResult['executed'] = [];
  const maxRetries = opts.maxRetriesPerJob ?? 3;

  for (let round = 0; round < (opts.maxRounds ?? 50); round++) {
    await dispatcher.dispatchOnce();
    const batch = transport.drain();
    if (batch.length === 0) break;
    for (const env of batch) {
      if (opts.stopAt?.includes(env.stage)) continue;
      const handler = handlers[env.stage];
      if (!handler) continue;
      let outcome: JobOutcome;
      let tries = 0;
      do {
        outcome = await executeJob(env as JobEnvelope, handler, { store: jobs, backoff: { baseMs: 1, maxMs: 1, jitter: 0 } });
        tries++;
      } while (outcome.kind === 'retry' && tries <= maxRetries);
      executed.push({ stage: env.stage, key: env.idempotencyKey, outcome });
    }
  }
  return { executed };
}
