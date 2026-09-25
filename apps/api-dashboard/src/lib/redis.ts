import 'server-only';
import Redis from 'ioredis';

const globalForRedis = global as unknown as { siteRedis: Redis | undefined };

/**
 * Shared connection for public-site bookkeeping (rate limits, sitemap
 * timestamps). It fails fast instead of queueing: every caller treats Redis as
 * optional, so a Redis outage must degrade those features, not hang requests.
 */
export function siteRedis(): Redis {
  if (!globalForRedis.siteRedis) {
    const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    // Without a listener ioredis logs every reconnect failure as unhandled.
    client.on('error', () => {});
    globalForRedis.siteRedis = client;
  }
  return globalForRedis.siteRedis;
}
