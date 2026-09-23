import { describe, expect, it } from 'vitest';
import {
  DiscoverSource,
  type DiscoverySource,
  type DiscoveryStore,
  type FeedState,
  type FeedStateUpdate,
  type KnownUrl,
  type ScrapeCandidate,
} from '../discovery/discover-source';
import { parseFeed, snapshotHash } from '../discovery/feed-parser';
import { InMemoryLock } from '../net/lock';
import { SafeFetcher } from '../net/safe-fetch';
import { fakeResolver, fakeTransport, rss, sitemapIndex, urlset } from './helpers';

const NOW = new Date('2026-09-22T00:00:00Z');

class MemoryStore implements DiscoveryStore {
  feedStates = new Map<string, FeedState>();
  urls = new Map<string, KnownUrl>();
  outbox = new Map<string, ScrapeCandidate>();
  runs: Array<{ status: string }> = [];
  constructor(public source: DiscoverySource) {}
  async getSource() {
    return this.source;
  }
  async getFeedState(_s: string, url: string) {
    return this.feedStates.get(url) ?? null;
  }
  async saveFeedState(_s: string, url: string, u: FeedStateUpdate) {
    this.feedStates.set(url, { etag: u.etag, lastModified: u.lastModified, snapshotHash: u.snapshotHash });
  }
  async invalidateFeedState(_s: string, urls: string[]) {
    urls.forEach((u) => this.feedStates.delete(u));
  }
  async getKnownUrls(_s: string, fps: string[]) {
    return new Map(fps.filter((f) => this.urls.has(f)).map((f) => [f, this.urls.get(f)!]));
  }
  async recordCandidates(_s: string, _c: string, candidates: ScrapeCandidate[]) {
    // Emulates the unique OutboxEvent.idempotencyKey constraint.
    let created = 0;
    for (const c of candidates) {
      this.urls.set(c.fingerprint, { lastmod: c.lastmod });
      if (!this.outbox.has(c.idempotencyKey)) {
        this.outbox.set(c.idempotencyKey, c);
        created++;
      }
    }
    return created;
  }
  async startRun() {
    this.runs.push({ status: 'running' });
    return String(this.runs.length - 1);
  }
  async finishRun(id: string, status: string) {
    this.runs[Number(id)].status = status;
  }
  async markScan(_s: string, o: { ok: boolean }) {
    if (o.ok) this.source.lastSuccessfulScanAt = NOW;
  }
}

function source(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: 'src-1',
    name: 'Example News',
    domains: ['news.example.com'],
    sitemaps: [],
    feeds: [],
    adapterKey: null,
    recencyWindowHours: 72,
    maxArticlesPerScan: 50,
    includePatterns: [],
    excludePatterns: [],
    lastSuccessfulScanAt: null,
    ...overrides,
  };
}

function fetcher(transport: ReturnType<typeof fakeTransport>) {
  return new SafeFetcher({ hostPolicy: (h) => h === 'news.example.com', resolver: fakeResolver(), transport });
}

const A = 'https://news.example.com/2026/09/startup-a-raises-seed';
const B = 'https://news.example.com/2026/09/startup-b-launches-product';
const C = 'https://news.example.com/2026/09/startup-c-acquired';

describe('feed parsing', () => {
  it('parses sitemap index, news urlset, RSS and Atom', () => {
    expect(parseFeed(Buffer.from(sitemapIndex([{ loc: 'https://x.com/a.xml' }]))).kind).toBe('sitemapindex');
    const news = parseFeed(Buffer.from(urlset([{ loc: A, news: { title: 'A', date: '2026-09-21T10:00:00Z' } }])));
    expect(news.entries[0]).toMatchObject({ loc: A, isNews: true, title: 'A' });
    const feed = parseFeed(Buffer.from(rss([{ link: B, title: 'B & co', pubDate: 'Mon, 21 Sep 2026 10:00:00 GMT' }])));
    expect(feed.kind).toBe('rss');
    expect(feed.entries[0].title).toBe('B & co');
    const atom = parseFeed(
      Buffer.from(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>C</title><link rel="alternate" href="${C}"/><updated>2026-09-21T10:00:00Z</updated></entry></feed>`),
    );
    expect(atom).toMatchObject({ kind: 'atom', entries: [{ loc: C }] });
  });

  it('snapshot hash ignores entry order but not content', () => {
    const one = parseFeed(Buffer.from(urlset([{ loc: A, lastmod: '2026-09-21' }, { loc: B, lastmod: '2026-09-21' }])));
    const two = parseFeed(Buffer.from(urlset([{ loc: B, lastmod: '2026-09-21' }, { loc: A, lastmod: '2026-09-21' }])));
    const three = parseFeed(Buffer.from(urlset([{ loc: A, lastmod: '2026-09-22' }, { loc: B, lastmod: '2026-09-21' }])));
    expect(snapshotHash(one)).toBe(snapshotHash(two));
    expect(snapshotHash(one)).not.toBe(snapshotHash(three));
  });
});

describe('DiscoverSource', () => {
  // Required test 1
  it('processes nested sitemap indexes without cycles', async () => {
    const root = 'https://news.example.com/sitemap.xml';
    const idx2 = 'https://news.example.com/sitemap-2026.xml';
    const leaf = 'https://news.example.com/sitemap-2026-09.xml';
    const transport = fakeTransport({
      [root]: { body: sitemapIndex([{ loc: idx2, lastmod: '2026-09-21' }, { loc: root, lastmod: '2026-09-21' }]) },
      // idx2 points back at the root and at itself: a cycle.
      [idx2]: { body: sitemapIndex([{ loc: leaf, lastmod: '2026-09-21' }, { loc: root }, { loc: `${idx2}#dup` }]) },
      [leaf]: { body: urlset([{ loc: A, lastmod: '2026-09-21T10:00:00Z' }]) },
    });
    const store = new MemoryStore(source({ sitemaps: [root] }));
    const res = await new DiscoverSource(store, fetcher(transport), new InMemoryLock(), { now: () => NOW }).run('src-1');
    expect(res.status).toBe('completed');
    expect(res.stats.enqueued).toBe(1);
    // Each document fetched exactly once despite the cycle.
    expect(transport.calls.filter((c) => c === root)).toHaveLength(1);
    expect(transport.calls.filter((c) => c === idx2)).toHaveLength(1);
    expect(transport.calls.filter((c) => c === leaf)).toHaveLength(1);
  });

  // Required test 2
  it('creates no jobs when the sitemap is unchanged (304 or identical content)', async () => {
    const map = 'https://news.example.com/news-sitemap.xml';
    const body = urlset([{ loc: A, lastmod: '2026-09-21T10:00:00Z' }, { loc: B, lastmod: '2026-09-21T11:00:00Z' }]);
    let honour304 = false;
    const transport = fakeTransport({
      [map]: (h) => (honour304 && h['if-none-match'] === '"v1"' ? { status: 304 } : { body, headers: { etag: '"v1"' } }),
    });
    const store = new MemoryStore(source({ sitemaps: [map] }));
    const disc = new DiscoverSource(store, fetcher(transport), new InMemoryLock(), { now: () => NOW });

    const first = await disc.run('src-1');
    expect(first.status).toBe('completed');
    expect(store.outbox.size).toBe(2);

    // Server ignores validators but content is identical -> snapshot hash says unchanged.
    const second = await disc.run('src-1');
    expect(second.status).toBe('unchanged');
    expect(second.stats.enqueued).toBe(0);

    // Server honours If-None-Match -> 304.
    honour304 = true;
    const third = await disc.run('src-1');
    expect(third.status).toBe('unchanged');
    expect(third.stats.feedsNotModified).toBe(1);
    expect(store.outbox.size).toBe(2);
  });

  // Required test 3
  it('creates jobs only for new or materially updated URLs when the sitemap changes', async () => {
    const map = 'https://news.example.com/news-sitemap.xml';
    let body = urlset([{ loc: A, lastmod: '2026-09-21T10:00:00Z' }, { loc: B, lastmod: '2026-09-21T11:00:00Z' }]);
    const transport = fakeTransport({ [map]: () => ({ body }) });
    const store = new MemoryStore(source({ sitemaps: [map] }));
    const disc = new DiscoverSource(store, fetcher(transport), new InMemoryLock(), { now: () => NOW });
    await disc.run('src-1');
    expect(store.outbox.size).toBe(2);

    // A unchanged, B updated (lastmod advanced), C new; plus a tag page and an out-of-window article.
    body = urlset([
      { loc: A, lastmod: '2026-09-21T10:00:00Z' },
      { loc: B, lastmod: '2026-09-21T15:00:00Z' },
      { loc: C, lastmod: '2026-09-21T16:00:00Z' },
      { loc: 'https://news.example.com/tag/startups', lastmod: '2026-09-21T16:00:00Z' },
      { loc: 'https://news.example.com/2025/01/old-story', lastmod: '2025-01-01T00:00:00Z' },
    ]);
    const res = await disc.run('src-1');
    expect(res.status).toBe('completed');
    expect(res.stats).toMatchObject({ newUrls: 1, updatedUrls: 1, enqueued: 2 });
    const keys = [...store.outbox.keys()];
    expect(keys.filter((k) => k.includes('2026-09-21T15:00:00.000Z'))).toHaveLength(1);
    expect([...store.outbox.values()].map((c) => c.canonicalUrl)).toContain(C);
    expect([...store.outbox.values()].some((c) => c.canonicalUrl.includes('/tag/'))).toBe(false);
  });

  // Required test 4
  it('concurrent scans cannot create duplicate candidates', async () => {
    const map = 'https://news.example.com/news-sitemap.xml';
    const transport = fakeTransport({
      [map]: { body: urlset([{ loc: A, lastmod: '2026-09-21T10:00:00Z' }, { loc: `${B}?utm_source=x`, lastmod: '2026-09-21T11:00:00Z' }]) },
    });
    const store = new MemoryStore(source({ sitemaps: [map] }));
    const lock = new InMemoryLock();
    // Same lock: only one scan runs, the others are skipped.
    const results = await Promise.all(Array.from({ length: 5 }, () => new DiscoverSource(store, fetcher(transport), lock, { now: () => NOW }).run('src-1')));
    expect(results.filter((r) => r.status === 'completed')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'skipped_locked')).toHaveLength(4);
    expect(store.outbox.size).toBe(2);

    // Even with NO shared lock (e.g. lock outage), idempotency keys prevent duplicates.
    const store2 = new MemoryStore(source({ sitemaps: [map] }));
    await Promise.all(Array.from({ length: 5 }, () => new DiscoverSource(store2, fetcher(transport), new InMemoryLock(), { now: () => NOW }).run('src-1')));
    expect(store2.outbox.size).toBe(2);
  });

  it('defers candidates beyond maxArticlesPerScan to the next scan instead of losing them', async () => {
    const map = 'https://news.example.com/news-sitemap.xml';
    const transport = fakeTransport({
      [map]: { body: urlset([A, B, C].map((loc, i) => ({ loc, lastmod: `2026-09-21T1${i}:00:00Z` }))) },
    });
    const store = new MemoryStore(source({ sitemaps: [map], maxArticlesPerScan: 2 }));
    const disc = new DiscoverSource(store, fetcher(transport), new InMemoryLock(), { now: () => NOW });
    const first = await disc.run('src-1');
    expect(first.stats).toMatchObject({ enqueued: 2, deferred: 1 });
    const second = await disc.run('src-1');
    expect(second.stats.enqueued).toBe(1);
    expect(store.outbox.size).toBe(3);
  });
});
