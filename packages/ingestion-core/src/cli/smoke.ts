/**
 * Run the real pipeline in-process for one source (or one URL), without Redis/BullMQ.
 * Uses the configured database and Bedrock. Stops at DRAFT: nothing is published.
 *
 *   npm run pipeline:smoke -- --source yourstory
 *   npm run pipeline:smoke -- --source thebridge --url https://thebridge.jp/2026/09/some-article
 */
import { PrismaClient } from '@lazyfounders/database';
import { TitanEmbeddingClient, createLlmClient, loadTaskConfig } from '@lazyfounders/llm';
import { RobotsService } from '../infra/robots-service';
import { createSnapshotStorage } from '../infra/snapshots';
import { runPipelineInline } from '../jobs/inline-runner';
import { executeJob } from '../jobs/execute';
import { PrismaJobStore } from '../jobs/job-store';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import { InMemoryLock } from '../net/lock';
import { InMemoryRateLimiter } from '../net/rate-limit';
import { canonicalizeUrl, urlFingerprint } from '../net/url-canonical';
import { DomainAllowlist } from '../registry/allowlist';
import { createStageHandlers, loadPipelineConfig } from '../stages';
import { arg, cliLogger, fail, loadEnv } from './common';

async function main() {
  loadEnv();
  const key = arg('source') ?? fail('usage: pipeline:smoke -- --source <registry-key> [--url <article-url>]');
  const url = arg('url');
  const prisma = new PrismaClient();
  try {
    const source = await prisma.source.findUnique({ where: { registryKey: key } });
    if (!source) fail(`Unknown source ${key}; run sources:sync`);
    if (source.trustStatus !== 'APPROVED' || !source.enabled) fail(`Source ${key} is not APPROVED and active (trust=${source.trustStatus}, enabled=${source.enabled})`);

    const config = { ...loadPipelineConfig(), autoPublishEnabled: false };
    const handlers = createStageHandlers(
      {
        prisma,
        allowlist: DomainAllowlist.fromPrisma(prisma, 0),
        robots: new RobotsService(),
        rateLimiter: new InMemoryRateLimiter(),
        snapshots: createSnapshotStorage(),
        llm: createLlmClient(loadTaskConfig()),
        embeddings: new TitanEmbeddingClient(),
        config,
        logger: cliLogger,
      },
      new InMemoryLock(),
    );
    const correlationId = `smoke:${key}:${Date.now()}`;

    if (url) {
      const canonical = canonicalizeUrl(url);
      const fp = urlFingerprint(canonical);
      const us = await prisma.urlState.upsert({
        where: { urlFingerprint: fp },
        create: { sourceId: source.id, url, urlHash: `v2:${fp}`, urlFingerprint: fp, canonicalUrl: canonical, status: 'new', changeType: 'NEW', lastEnqueuedVersion: 'smoke' },
        update: {},
      });
      await prisma.$transaction((tx) =>
        emitEvent(tx, {
          stage: STAGES.SCRAPE,
          idempotencyKey: `${STAGES.SCRAPE}:${fp}:smoke:${Date.now()}`,
          correlationId,
          subjectType: 'url_state',
          subjectId: us.id,
          payload: { sourceId: source.id, urlStateId: us.id, url, canonicalUrl: canonical, fingerprint: fp, version: 'smoke' },
        }),
      );
    } else {
      await executeJob(
        { idempotencyKey: `${STAGES.DISCOVER}:${source.id}:smoke:${Date.now()}`, correlationId, stage: STAGES.DISCOVER, subjectType: 'source', subjectId: source.id, payload: { sourceId: source.id } },
        handlers[STAGES.DISCOVER],
        { store: new PrismaJobStore(prisma) },
      );
    }

    const run = await runPipelineInline(prisma, handlers, { stopAt: [STAGES.PUBLISH] });
    const summary = run.executed.reduce<Record<string, Record<string, number>>>((acc, e) => {
      acc[e.stage] ??= {};
      acc[e.stage][e.outcome.kind] = (acc[e.stage][e.outcome.kind] ?? 0) + 1;
      return acc;
    }, {});
    console.log('Stage outcomes:', JSON.stringify(summary, null, 2));
    for (const e of run.executed.filter((x) => x.outcome.kind === 'dead_letter' || x.outcome.kind === 'retry')) {
      console.log('FAILED', e.stage, e.key, 'error' in e.outcome ? `${e.outcome.error.code}: ${e.outcome.error.message}` : '');
    }
    const drafts = await prisma.article.findMany({
      where: { story: { sources: { some: { sourceArticle: { correlationId } } } } },
      select: { slug: true, status: true, currentVersionId: true },
    });
    console.log('Articles:', drafts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => fail((err as Error).stack ?? String(err)));
