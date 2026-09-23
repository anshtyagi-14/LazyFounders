import { DiscoverSource } from '../discovery/discover-source';
import { PrismaDiscoveryStore } from '../discovery/prisma-store';
import type { StageHandler } from '../jobs/execute';
import { STAGES, type Stage } from '../jobs/stages';
import type { DistributedLock } from '../net/lock';
import { SafeFetcher } from '../net/safe-fetch';
import { BlockedError } from '../errors';
import type { PipelineDeps } from './context';
import { dedupeHandler } from './dedupe';
import { extractHandler, translateHandler } from './extract-translate';
import { generateHandler } from './generate';
import { normalizeHandler } from './normalize';
import { scrapeHandler } from './scrape';
import { publishHandler, validateHandler } from './validate-publish';

export * from './context';
export * from './structure';
export * from './story';
export * from './generate';
export * from './validate-publish';

/** discover.source: scan one source (lock + change detection + candidate outbox writes). */
export function discoverHandler(deps: PipelineDeps, lock: DistributedLock): StageHandler<{ sourceId: string }> {
  const store = new PrismaDiscoveryStore(deps.prisma);
  return async (env) => {
    const sourceId = env.payload.sourceId;
    const fetcher = new SafeFetcher({
      hostPolicy: deps.allowlist.forSource(sourceId),
      resolver: deps.resolver,
      transport: deps.transport,
      maxBytes: Number(process.env.FETCH_MAX_BYTES_SITEMAP || 20 * 1024 * 1024),
    });
    const source = await deps.prisma.source.findUnique({ where: { id: sourceId }, select: { robotsRequired: true } });
    // Feeds and sitemaps obey robots.txt too (same cache and fail-closed rules as articles).
    const politeFetcher = {
      fetch: async (req: Parameters<SafeFetcher['fetch']>[0]) => {
        const robots = await deps.robots.check(req.url, fetcher, source?.robotsRequired ?? true);
        if (!robots.allowed) throw new BlockedError(`robots.txt disallows ${new URL(req.url).pathname}`, 'robots_disallowed');
        return fetcher.fetch(req);
      },
    };
    const result = await new DiscoverSource(store, politeFetcher, lock).run(sourceId, env.correlationId);
    deps.metrics?.sourceScans.inc({ source: sourceId, result: result.status });
    deps.logger.info({ correlationId: env.correlationId, sourceId, status: result.status, ...result.stats, errors: result.stats.errors.length }, 'source scan');
    if (result.status === 'failed') {
      const s = await deps.prisma.source.findUnique({ where: { id: sourceId }, select: { name: true, consecutiveFailures: true, lastError: true } });
      if (s && s.consecutiveFailures >= Number(process.env.ALERT_SOURCE_FAILURES || 3)) await deps.alerts?.sourceFailing(s.name, s.consecutiveFailures, s.lastError);
    }
  };
}

/** All stage handlers. Services pick the stages they run with WORKER_STAGES. */
export function createStageHandlers(deps: PipelineDeps, lock: DistributedLock): Record<Stage, StageHandler<any>> {
  return {
    [STAGES.DISCOVER]: discoverHandler(deps, lock),
    [STAGES.SCRAPE]: scrapeHandler(deps),
    [STAGES.NORMALIZE]: normalizeHandler(deps),
    [STAGES.EXTRACT]: extractHandler(deps),
    [STAGES.TRANSLATE]: translateHandler(deps),
    [STAGES.DEDUPE]: dedupeHandler(deps),
    [STAGES.GENERATE]: generateHandler(deps),
    [STAGES.VALIDATE]: validateHandler(deps),
    [STAGES.PUBLISH]: publishHandler(deps),
  };
}
