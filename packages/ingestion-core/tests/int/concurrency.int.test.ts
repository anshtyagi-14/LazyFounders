/**
 * Concurrent scans against real PostgreSQL (unique outbox keys) and real Redis (lock).
 *   TEST_DATABASE_URL=... TEST_REDIS_URL=redis://localhost:6379 npm run test:int -w @lazyfounders/ingestion-core
 */
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaClient } from '@lazyfounders/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeResolver, fakeTransport, urlset } from '../../src/__tests__/helpers';
import { DiscoverSource, InMemoryLock, PrismaDiscoveryStore, RedisLock, SafeFetcher, parseSourceConfig, syncSourceConfigs } from '../../src';

const DB = process.env.TEST_DATABASE_URL;
const REDIS = process.env.TEST_REDIS_URL;
const suite = DB ? describe : describe.skip;

suite('concurrent discovery (PostgreSQL + Redis)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
  const redis = REDIS ? new Redis(REDIS, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  const prefix = `lf:test:${randomUUID()}:`;
  let sourceId: string;
  const map = 'https://concurrency.example.com/news-sitemap.xml';
  const now = new Date();
  const urls = Array.from({ length: 5 }, (_, i) => ({ loc: `https://concurrency.example.com/2026/09/story-${i}`, lastmod: new Date(now.getTime() - i * 60_000).toISOString() }));

  const fetcher = () =>
    new SafeFetcher({
      hostPolicy: (h) => h === 'concurrency.example.com',
      resolver: fakeResolver(),
      transport: fakeTransport({ [map]: { body: urlset(urls), headers: { 'content-type': 'application/xml' } } }),
    });

  beforeAll(async () => {
    await redis?.connect();
    await prisma.source.deleteMany({ where: { registryKey: 'concurrency-test' } });
    await syncSourceConfigs(prisma, [
      parseSourceConfig(`key: concurrency-test
name: Concurrency Test
country: US
defaultLanguage: en
trustStatus: APPROVED
active: true
domains:
  primary: concurrency.example.com
discovery:
  methods: [news_sitemap]
  sitemaps: [${map}]
`),
    ]);
    sourceId = (await prisma.source.findUniqueOrThrow({ where: { registryKey: 'concurrency-test' } })).id;
  });

  afterAll(async () => {
    await prisma.source.deleteMany({ where: { registryKey: 'concurrency-test' } });
    if (redis) {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
      redis.disconnect();
    }
    await prisma.$disconnect();
  });

  const outboxCount = () => prisma.outboxEvent.count({ where: { payload: { path: ['sourceId'], equals: sourceId } } });

  it.runIf(Boolean(REDIS))('a shared Redis lock lets exactly one of N concurrent scans run', async () => {
    const lockA = new RedisLock(redis!, prefix);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => new DiscoverSource(new PrismaDiscoveryStore(prisma), fetcher(), lockA).run(sourceId)),
    );
    expect(results.filter((r) => r.status === 'completed')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'skipped_locked')).toHaveLength(5);
    expect(await outboxCount()).toBe(5);
  });

  it('without any shared lock, unique idempotency keys still prevent duplicate candidates', async () => {
    await prisma.outboxEvent.deleteMany({ where: { payload: { path: ['sourceId'], equals: sourceId } } });
    await prisma.urlState.deleteMany({ where: { sourceId } });
    await prisma.sitemap.deleteMany({ where: { sourceId } });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => new DiscoverSource(new PrismaDiscoveryStore(prisma), fetcher(), new InMemoryLock()).run(sourceId)),
    );
    // Racing transactions may fail on unique constraints (and would be retried by the
    // job layer); what matters is that no duplicate work was ever committed.
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(await outboxCount()).toBe(5);
    expect(await prisma.urlState.count({ where: { sourceId } })).toBe(5);
  });
});
