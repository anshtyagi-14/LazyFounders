import 'server-only';
import { prisma } from './prisma';
import { siteRedis } from './redis';

/** Redis key the sitemap routes stamp after each successful generation. */
export const SITEMAP_STAMP_KEY = 'site:sitemap:last';

export async function stampSitemapGenerated(): Promise<void> {
  try {
    await siteRedis().set(SITEMAP_STAMP_KEY, new Date().toISOString());
  } catch {
    // Monitoring metadata only.
  }
}

export interface SiteHealth {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  database: boolean;
  redis: boolean;
  lastPipelineSuccessAt: string | null;
  lastCrawlAt: string | null;
  sitemapGeneratedAt: string | null;
  latestErrorAt: string | null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/**
 * One snapshot for /api/health, the uptime monitor and the admin overview.
 * "down" only when the database is unreachable — that is the one dependency
 * every public page needs. A Redis outage or a stalled pipeline is "degraded":
 * the site still serves.
 */
export async function siteHealth(): Promise<SiteHealth> {
  const database = await withTimeout(prisma.$queryRaw`SELECT 1`, 3000).then(() => true, () => false);
  const redis = await withTimeout(siteRedis().ping(), 2000).then((r) => r === 'PONG', () => false);

  let lastPipelineSuccessAt: string | null = null;
  let lastCrawlAt: string | null = null;
  let latestErrorAt: string | null = null;
  if (database) {
    const [job, crawl, error] = await Promise.all([
      prisma.pipelineJob.findFirst({ where: { status: 'SUCCEEDED' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } }).catch(() => null),
      prisma.crawlRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true } }).catch(() => null),
      prisma.siteError.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }).catch(() => null),
    ]);
    lastPipelineSuccessAt = job?.completedAt?.toISOString() ?? null;
    lastCrawlAt = crawl?.startedAt.toISOString() ?? null;
    latestErrorAt = error?.lastSeenAt.toISOString() ?? null;
  }
  const sitemapGeneratedAt = redis ? await siteRedis().get(SITEMAP_STAMP_KEY).catch(() => null) : null;

  const pipelineStale = !lastPipelineSuccessAt || Date.now() - Date.parse(lastPipelineSuccessAt) > 6 * 3600_000;
  const status = !database ? 'down' : !redis || pipelineStale ? 'degraded' : 'ok';

  return {
    status,
    checkedAt: new Date().toISOString(),
    database,
    redis,
    lastPipelineSuccessAt,
    lastCrawlAt,
    sitemapGeneratedAt,
    latestErrorAt,
  };
}

export interface RouteProbe {
  name: string;
  path: string;
  status: number | null;
  ms: number | null;
}

/**
 * Request key public routes from this server itself (loopback, so it measures
 * the app rather than DNS or the load balancer). Admin-only: it costs a render
 * of each route.
 */
export async function probeRoutes(): Promise<RouteProbe[]> {
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const targets = [
    { name: 'Homepage', path: '/' },
    { name: 'Health API', path: '/api/health' },
    { name: 'Sitemap', path: '/sitemap.xml' },
    { name: 'RSS', path: '/feed.xml' },
  ];
  return Promise.all(
    targets.map(async (t) => {
      const started = Date.now();
      try {
        const res = await fetch(base + t.path, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
          headers: { 'user-agent': 'lazyfounders-admin-probe' },
        });
        await res.arrayBuffer();
        return { ...t, status: res.status, ms: Date.now() - started };
      } catch {
        return { ...t, status: null, ms: null };
      }
    }),
  );
}
