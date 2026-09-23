import { randomUUID } from 'node:crypto';
import { serializeError, type SerializedError } from '../errors';
import type { DistributedLock } from '../net/lock';
import type { SafeFetchResponse } from '../net/safe-fetch';
import { canonicalizeUrl, hostOf, urlFingerprint } from '../net/url-canonical';
import { getAdapter } from '../registry/adapters';
import { parseFeed, snapshotHash, type FeedEntry } from './feed-parser';

export interface DiscoverySource {
  id: string;
  name: string;
  domains: string[];
  sitemaps: string[];
  feeds: string[];
  adapterKey: string | null;
  recencyWindowHours: number;
  maxArticlesPerScan: number;
  includePatterns: string[];
  excludePatterns: string[];
  lastSuccessfulScanAt: Date | null;
  /** Carry publisher-provided feed full text to the scrape stage. */
  useFeedContent?: boolean;
}

export interface FeedState {
  etag: string | null;
  lastModified: string | null;
  snapshotHash: string | null;
}

export interface FeedStateUpdate extends FeedState {
  httpStatus: number | null;
  changed: boolean;
  notModified: boolean;
  urlCount: number;
  durationMs: number;
  type: string;
}

export interface KnownUrl {
  lastmod: Date | null;
}

export interface ScrapeCandidate {
  url: string;
  canonicalUrl: string;
  fingerprint: string;
  lastmod: Date | null;
  publishedAt: Date | null;
  title: string | null;
  changeType: 'NEW' | 'UPDATED';
  /** Version marker making the scrape job key unique per material update. */
  version: string;
  idempotencyKey: string;
  /** Publisher-provided full text from the feed (only when the source uses feed content). */
  feedContent?: { html: string; author: string | null } | null;
}

export interface ScanStats {
  feedsFetched: number;
  feedsNotModified: number;
  feedsUnchanged: number;
  feedsChanged: number;
  entriesSeen: number;
  newUrls: number;
  updatedUrls: number;
  enqueued: number;
  /** Candidates beyond maxArticlesPerScan, left for the next scan. */
  deferred: number;
  errors: SerializedError[];
}

/** Persistence port. The Prisma implementation writes candidates + outbox rows in one transaction. */
export interface DiscoveryStore {
  getSource(sourceId: string): Promise<DiscoverySource | null>;
  getFeedState(sourceId: string, url: string): Promise<FeedState | null>;
  saveFeedState(sourceId: string, url: string, update: FeedStateUpdate): Promise<void>;
  getKnownUrls(sourceId: string, fingerprints: string[]): Promise<Map<string, KnownUrl>>;
  /** Idempotent: returns the number of NEW outbox events actually created. */
  recordCandidates(sourceId: string, correlationId: string, candidates: ScrapeCandidate[]): Promise<number>;
  startRun(sourceId: string, correlationId: string): Promise<string>;
  finishRun(runId: string, status: ScanResult['status'], stats: ScanStats, durationMs: number): Promise<void>;
  markScan(sourceId: string, outcome: { ok: boolean; changed: boolean; error?: string }): Promise<void>;
  /** Forget stored validators/hashes so the next scan re-reads these feeds in full. */
  invalidateFeedState(sourceId: string, urls: string[]): Promise<void>;
}

export interface FeedFetcher {
  fetch(req: { url: string; etag?: string | null; lastModified?: string | null; maxBytes?: number }): Promise<SafeFetchResponse>;
}

export interface ScanResult {
  status: 'unchanged' | 'completed' | 'failed' | 'skipped_locked' | 'not_found';
  correlationId: string;
  stats: ScanStats;
}

export interface DiscoverOptions {
  maxDepth?: number;
  maxChildrenPerIndex?: number;
  maxFeedsPerScan?: number;
  lockTtlMs?: number;
  now?: () => Date;
}

/**
 * Scan one source: conditional-GET every configured sitemap/feed, stop early when
 * nothing changed, otherwise extract only new or materially updated article URLs and
 * hand them to the store (which writes UrlState + outbox events transactionally).
 *
 * Safety properties:
 *  - A distributed lock guarantees one concurrent scan per source across replicas.
 *  - Even without the lock, candidates carry stable idempotency keys, so duplicate
 *    scans cannot create duplicate scrape jobs.
 *  - Sitemap indexes are walked breadth-first with a visited set (cycle-safe), a depth
 *    limit, and a per-index child limit that prefers recently modified children, so a
 *    publisher's full historical archive is never re-read on every scan.
 */
export class DiscoverSource {
  private readonly maxDepth: number;
  private readonly maxChildren: number;
  private readonly maxFeeds: number;
  private readonly lockTtlMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly store: DiscoveryStore,
    private readonly fetcher: FeedFetcher,
    private readonly lock: DistributedLock,
    opts: DiscoverOptions = {},
  ) {
    this.maxDepth = opts.maxDepth ?? 3;
    this.maxChildren = opts.maxChildrenPerIndex ?? 10;
    this.maxFeeds = opts.maxFeedsPerScan ?? 50;
    this.lockTtlMs = opts.lockTtlMs ?? 10 * 60_000;
    this.now = opts.now ?? (() => new Date());
  }

  async run(sourceId: string, correlationId: string = randomUUID()): Promise<ScanResult> {
    const stats: ScanStats = {
      feedsFetched: 0,
      feedsNotModified: 0,
      feedsUnchanged: 0,
      feedsChanged: 0,
      entriesSeen: 0,
      newUrls: 0,
      updatedUrls: 0,
      enqueued: 0,
      deferred: 0,
      errors: [],
    };
    const changedFeeds: string[] = [];

    const handle = await this.lock.acquire(`discover:${sourceId}`, this.lockTtlMs);
    if (!handle) return { status: 'skipped_locked', correlationId, stats };

    try {
      const source = await this.store.getSource(sourceId);
      if (!source) return { status: 'not_found', correlationId, stats };

      const started = Date.now();
      const runId = await this.store.startRun(sourceId, correlationId);
      const entries = await this.collectChangedEntries(source, stats, changedFeeds);
      const allFailed = stats.feedsFetched === 0 && stats.errors.length > 0;

      if (allFailed) {
        await this.store.finishRun(runId, 'failed', stats, Date.now() - started);
        await this.store.markScan(sourceId, { ok: false, changed: false, error: stats.errors[0]?.message });
        return { status: 'failed', correlationId, stats };
      }

      if (stats.feedsChanged === 0) {
        await this.store.finishRun(runId, 'unchanged', stats, Date.now() - started);
        await this.store.markScan(sourceId, { ok: true, changed: false });
        return { status: 'unchanged', correlationId, stats };
      }

      const all = await this.selectCandidates(source, entries, stats);
      const candidates = all.slice(0, source.maxArticlesPerScan);
      stats.deferred = all.length - candidates.length;
      stats.enqueued = candidates.length ? await this.store.recordCandidates(sourceId, correlationId, candidates) : 0;
      // Capped scan: make sure the next scan sees these feeds as changed again so the
      // deferred URLs are not lost behind an unchanged snapshot hash.
      if (stats.deferred > 0) await this.store.invalidateFeedState(sourceId, changedFeeds);
      await this.store.finishRun(runId, 'completed', stats, Date.now() - started);
      await this.store.markScan(sourceId, { ok: true, changed: true });
      return { status: 'completed', correlationId, stats };
    } finally {
      await handle.release();
    }
  }

  private async collectChangedEntries(source: DiscoverySource, stats: ScanStats, changedFeeds: string[]): Promise<FeedEntry[]> {
    const queue: Array<{ url: string; depth: number }> = [...source.sitemaps, ...source.feeds].map((url) => ({ url, depth: 0 }));
    const visited = new Set<string>();
    const entries: FeedEntry[] = [];
    // Children older than the last successful scan (minus slack) cannot contain new URLs.
    const since = source.lastSuccessfulScanAt ? new Date(source.lastSuccessfulScanAt.getTime() - 6 * 3600_000) : null;

    while (queue.length > 0 && visited.size < this.maxFeeds) {
      const { url, depth } = queue.shift()!;
      let key: string;
      try {
        key = canonicalizeUrl(url);
      } catch {
        continue;
      }
      if (visited.has(key)) continue;
      visited.add(key);

      const t0 = Date.now();
      try {
        const state = await this.store.getFeedState(source.id, url);
        const res = await this.fetcher.fetch({
          url,
          etag: state?.etag,
          lastModified: state?.lastModified,
          maxBytes: Number(process.env.FETCH_MAX_BYTES_SITEMAP || 20 * 1024 * 1024),
        });
        stats.feedsFetched++;

        if (res.notModified) {
          stats.feedsNotModified++;
          await this.store.saveFeedState(source.id, url, {
            etag: state?.etag ?? res.etag,
            lastModified: state?.lastModified ?? res.lastModified,
            snapshotHash: state?.snapshotHash ?? null,
            httpStatus: 304,
            changed: false,
            notModified: true,
            urlCount: 0,
            durationMs: Date.now() - t0,
            type: 'unknown',
          });
          continue;
        }

        const feed = parseFeed(res.body);
        const hash = snapshotHash(feed);
        const changed = state?.snapshotHash !== hash;
        await this.store.saveFeedState(source.id, url, {
          etag: res.etag,
          lastModified: res.lastModified,
          snapshotHash: hash,
          httpStatus: res.status,
          changed,
          notModified: false,
          urlCount: feed.entries.length + feed.children.length,
          durationMs: Date.now() - t0,
          type: feed.kind,
        });
        if (feed.kind === 'sitemapindex') {
          // An index is only a pointer: whether the source changed is decided by its
          // children. Some publishers regenerate child sitemaps without touching the
          // index, so an unchanged index still gets its newest children probed
          // (cheap conditional GETs); a changed index gets up to maxChildren.
          if (!changed) stats.feedsUnchanged++;
          if (depth + 1 > this.maxDepth) continue;
          const children = feed.children
            .filter((c) => !since || !c.lastmod || c.lastmod >= since)
            .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0))
            .slice(0, changed ? this.maxChildren : Math.min(2, this.maxChildren));
          for (const c of children) queue.push({ url: c.loc, depth: depth + 1 });
          continue;
        }
        if (!changed) {
          stats.feedsUnchanged++;
          continue;
        }
        stats.feedsChanged++;
        changedFeeds.push(url);
        entries.push(...feed.entries);
      } catch (err) {
        stats.errors.push({ ...serializeError(err), details: { url } });
      }
    }
    stats.entriesSeen = entries.length;
    return entries;
  }

  private async selectCandidates(source: DiscoverySource, entries: FeedEntry[], stats: ScanStats): Promise<ScrapeCandidate[]> {
    const adapter = getAdapter(source.adapterKey);
    const include = source.includePatterns.map((p) => new RegExp(p));
    const exclude = source.excludePatterns.map((p) => new RegExp(p));
    const cutoff = this.now().getTime() - source.recencyWindowHours * 3600_000;

    const byFp = new Map<string, ScrapeCandidate>();
    for (const e of entries) {
      let canonical: string;
      try {
        canonical = canonicalizeUrl(e.loc);
      } catch {
        continue;
      }
      const url = new URL(canonical);
      const host = hostOf(canonical);
      if (!source.domains.some((d) => host === d || host.endsWith('.' + d))) continue;
      if (adapter.isArticleUrl && !adapter.isArticleUrl(url)) continue;
      if (include.length && !include.some((r) => r.test(url.pathname))) continue;
      if (exclude.some((r) => r.test(url.pathname))) continue;
      const date = e.lastmod ?? e.publishedAt;
      if (date && date.getTime() < cutoff) continue;

      const fingerprint = urlFingerprint(canonical);
      const prev = byFp.get(fingerprint);
      if (prev && (prev.lastmod?.getTime() ?? 0) >= (e.lastmod?.getTime() ?? 0)) continue;
      byFp.set(fingerprint, {
        url: e.loc,
        canonicalUrl: canonical,
        fingerprint,
        lastmod: e.lastmod,
        publishedAt: e.publishedAt,
        title: e.title,
        feedContent: source.useFeedContent && e.contentHtml ? { html: e.contentHtml.slice(0, 400_000), author: e.author } : null,
        changeType: 'NEW',
        version: 'first',
        idempotencyKey: '',
      });
    }

    const known = await this.store.getKnownUrls(source.id, [...byFp.keys()]);
    const out: ScrapeCandidate[] = [];
    for (const c of byFp.values()) {
      const k = known.get(c.fingerprint);
      if (!k) {
        c.changeType = 'NEW';
        c.version = c.lastmod ? c.lastmod.toISOString() : 'first';
        stats.newUrls++;
      } else if (c.lastmod && (!k.lastmod || c.lastmod.getTime() > k.lastmod.getTime())) {
        c.changeType = 'UPDATED';
        c.version = c.lastmod.toISOString();
        stats.updatedUrls++;
      } else {
        continue;
      }
      c.idempotencyKey = `article.scrape:${c.fingerprint}:${c.version}`;
      out.push(c);
    }

    // Newest first; undated entries last. The caller caps per scan so one noisy source cannot flood the queue.
    return out.sort((a, b) => ((b.lastmod ?? b.publishedAt)?.getTime() ?? 0) - ((a.lastmod ?? a.publishedAt)?.getTime() ?? 0));
  }
}
