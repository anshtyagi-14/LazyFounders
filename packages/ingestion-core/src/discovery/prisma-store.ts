import type { PrismaClient } from '@lazyfounders/database';
import { STAGES } from '../jobs/stages';
import type {
  DiscoverySource,
  DiscoveryStore,
  FeedState,
  FeedStateUpdate,
  KnownUrl,
  ScanResult,
  ScanStats,
  ScrapeCandidate,
} from './discover-source';

const FAILURE_THRESHOLDS = { degraded: 2, failing: 5 };

export class PrismaDiscoveryStore implements DiscoveryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getSource(sourceId: string): Promise<DiscoverySource | null> {
    const s = await this.prisma.source.findUnique({ where: { id: sourceId }, include: { domains: true } });
    if (!s || s.trustStatus !== 'APPROVED' || !s.enabled) return null;
    const rules = (s.customFilterRules ?? {}) as { include?: string[]; exclude?: string[] };
    const policy = (s.crawlPolicy ?? {}) as { contentSource?: string };
    return {
      id: s.id,
      name: s.name,
      domains: s.domains.filter((d) => d.kind !== 'asset').map((d) => d.domain),
      sitemaps: s.customSitemapUrls,
      feeds: s.feedUrls,
      adapterKey: s.adapterKey,
      recencyWindowHours: s.recencyWindowHours,
      maxArticlesPerScan: s.maxArticlesPerScan,
      includePatterns: rules.include ?? [],
      excludePatterns: rules.exclude ?? [],
      lastSuccessfulScanAt: s.lastSuccessfulScanAt,
      useFeedContent: policy.contentSource === 'feed' || policy.contentSource === 'page_then_feed',
    };
  }

  async getFeedState(sourceId: string, url: string): Promise<FeedState | null> {
    const sitemap = await this.prisma.sitemap.findUnique({
      where: { sourceId_url: { sourceId, url } },
      include: { states: { orderBy: { lastFetchedAt: 'desc' }, take: 1 } },
    });
    const st = sitemap?.states[0];
    if (!st) return null;
    return { etag: st.etag, lastModified: st.lastModified, snapshotHash: st.snapshotHash };
  }

  async saveFeedState(sourceId: string, url: string, u: FeedStateUpdate): Promise<void> {
    const sitemap = await this.prisma.sitemap.upsert({
      where: { sourceId_url: { sourceId, url } },
      create: { sourceId, url, type: u.type, discoveryMethod: 'manual' },
      update: u.type !== 'unknown' ? { type: u.type } : {},
    });
    await this.prisma.sitemapState.create({
      data: {
        sitemapId: sitemap.id,
        etag: u.etag,
        lastModified: u.lastModified,
        snapshotHash: u.snapshotHash,
        contentHash: u.snapshotHash,
        urlCount: u.urlCount,
        lastFetchedAt: new Date(),
        fetchDurationMs: u.durationMs,
        httpStatus: u.httpStatus,
        changed: u.changed,
        notModified: u.notModified,
      },
    });
  }

  async invalidateFeedState(sourceId: string, urls: string[]): Promise<void> {
    if (!urls.length) return;
    const sitemaps = await this.prisma.sitemap.findMany({ where: { sourceId, url: { in: urls } }, select: { id: true } });
    for (const s of sitemaps) {
      await this.prisma.sitemapState.create({
        data: { sitemapId: s.id, lastFetchedAt: new Date(), snapshotHash: null, etag: null, lastModified: null, changed: true },
      });
    }
  }

  async getKnownUrls(sourceId: string, fingerprints: string[]): Promise<Map<string, KnownUrl>> {
    const rows = await this.prisma.urlState.findMany({
      where: { sourceId, urlFingerprint: { in: fingerprints } },
      select: { urlFingerprint: true, lastmod: true },
    });
    return new Map(rows.map((r) => [r.urlFingerprint!, { lastmod: r.lastmod }]));
  }

  /**
   * Upserts UrlState and writes one outbox event per candidate in a single transaction.
   * OutboxEvent.idempotencyKey is unique, so concurrent or repeated scans insert nothing twice.
   */
  async recordCandidates(sourceId: string, correlationId: string, candidates: ScrapeCandidate[]): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      for (const c of candidates) {
        const urlState = await tx.urlState.upsert({
          where: { urlFingerprint: c.fingerprint },
          create: {
            sourceId,
            url: c.url,
            urlHash: `v2:${c.fingerprint}`,
            urlFingerprint: c.fingerprint,
            canonicalUrl: c.canonicalUrl,
            lastmod: c.lastmod,
            newsPublicationDate: c.publishedAt,
            titleHint: c.title?.slice(0, 500),
            status: 'new',
            changeType: c.changeType,
            lastEnqueuedVersion: c.version,
          },
          update: {
            lastmod: c.lastmod ?? undefined,
            lastSeenAt: new Date(),
            changeType: c.changeType,
            status: 'active',
            lastEnqueuedVersion: c.version,
          },
        });
        const res = await tx.outboxEvent.createMany({
          data: [
            {
              stage: STAGES.SCRAPE,
              idempotencyKey: c.idempotencyKey,
              correlationId,
              subjectType: 'url_state',
              subjectId: urlState.id,
              payload: {
                sourceId,
                urlStateId: urlState.id,
                url: c.url,
                canonicalUrl: c.canonicalUrl,
                fingerprint: c.fingerprint,
                version: c.version,
                title: c.title,
                publishedAt: (c.publishedAt ?? c.lastmod)?.toISOString() ?? null,
                ...(c.feedContent ? { feedContent: c.feedContent } : {}),
              },
            },
          ],
          skipDuplicates: true,
        });
        created += res.count;
      }
      return created;
    });
  }

  async startRun(sourceId: string, correlationId: string): Promise<string> {
    const run = await this.prisma.crawlRun.create({ data: { sourceId, traceId: correlationId, status: 'running' } });
    return run.id;
  }

  async finishRun(runId: string, status: ScanResult['status'], stats: ScanStats, durationMs: number): Promise<void> {
    await this.prisma.crawlRun.update({
      where: { id: runId },
      data: {
        status,
        totalUrls: stats.entriesSeen,
        newUrls: stats.newUrls,
        updatedUrls: stats.updatedUrls,
        unchangedUrls: Math.max(0, stats.entriesSeen - stats.newUrls - stats.updatedUrls),
        errorCount: stats.errors.length,
        sitemapsProcessed: stats.feedsFetched,
        durationMs,
        completedAt: new Date(),
        errors: stats.errors.length
          ? {
              create: stats.errors.slice(0, 50).map((e) => ({
                url: (e.details?.url as string | undefined) ?? null,
                errorType: e.code,
                errorMessage: e.message,
                metadata: { retryable: e.retryable },
              })),
            }
          : undefined,
      },
    });
  }

  async markScan(sourceId: string, outcome: { ok: boolean; changed: boolean; error?: string }): Promise<void> {
    const now = new Date();
    if (outcome.ok) {
      await this.prisma.source.update({
        where: { id: sourceId },
        data: {
          lastCrawledAt: now,
          lastSuccessfulScanAt: now,
          ...(outcome.changed ? { lastChangeDetectedAt: now } : {}),
          consecutiveFailures: 0,
          failureStatus: 'OK',
          lastError: null,
        },
      });
      return;
    }
    const s = await this.prisma.source.update({
      where: { id: sourceId },
      data: { lastCrawledAt: now, consecutiveFailures: { increment: 1 }, lastError: outcome.error?.slice(0, 500) },
    });
    const status =
      s.consecutiveFailures >= FAILURE_THRESHOLDS.failing ? 'FAILING' : s.consecutiveFailures >= FAILURE_THRESHOLDS.degraded ? 'DEGRADED' : 'OK';
    await this.prisma.source.update({ where: { id: sourceId }, data: { failureStatus: status } });
  }
}
