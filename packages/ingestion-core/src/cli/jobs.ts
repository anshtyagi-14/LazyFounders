/**
 * Dead-letter operations.
 *   npm run jobs:list -- [--stage article.scrape] [--status DEAD_LETTER]
 *   npm run jobs:replay -- <jobId>
 *   npm run jobs:replay -- --all --stage article.extract     (replays every dead-lettered job of a stage)
 */
import { PrismaClient } from '@lazyfounders/database';
import { DeadLetterService } from '../jobs/dlq';
import { PrismaJobStore, type JobStatus } from '../jobs/job-store';
import { ALL_STAGES, type Stage } from '../jobs/stages';
import { BullTransport } from '../jobs/transport';
import { redisOptions } from '../runtime';
import { arg, fail, flag, loadEnv } from './common';

async function main() {
  loadEnv();
  const cmd = process.argv[2];
  const stage = arg('stage') as Stage | undefined;
  if (stage && !ALL_STAGES.includes(stage)) fail(`Unknown stage ${stage}`);
  const prisma = new PrismaClient();
  const transport = new BullTransport(redisOptions());
  const dlq = new DeadLetterService(new PrismaJobStore(prisma), transport);
  try {
    if (cmd === 'list') {
      const jobs = await dlq.list({ stage, status: (arg('status') as JobStatus) ?? 'DEAD_LETTER', limit: Number(arg('limit') ?? 100) });
      for (const j of jobs) {
        console.log([j.id, j.stage.padEnd(18), j.status, `attempts=${j.attempts}`, `replays=${j.replayCount}`, j.lastError?.code ?? '', (j.lastError?.message ?? '').slice(0, 100)].join('  '));
      }
      console.log(`${jobs.length} job(s)`);
    } else if (cmd === 'replay') {
      const ids = flag('all') ? (await dlq.list({ stage, limit: 500 })).map((j) => j.id) : [process.argv[3]].filter(Boolean);
      if (!ids.length) fail('usage: jobs replay <jobId> | --all [--stage <stage>]');
      for (const id of ids) {
        const r = await dlq.replay(id);
        console.log(id, r.replayed ? 'replayed' : `skipped (${r.reason})`);
      }
    } else {
      fail('usage: jobs <list|replay>');
    }
  } finally {
    await transport.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
