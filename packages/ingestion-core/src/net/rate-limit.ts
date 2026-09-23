import type Redis from 'ioredis';

export interface RateLimiter {
  /** Try to take one slot in the per-key minute window. */
  tryAcquire(key: string, perMinute: number): Promise<boolean>;
}

const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, now .. '-' .. ARGV[4])
  redis.call('PEXPIRE', key, window)
  return 1
end
return 0
`;

/** Distributed per-domain sliding window (same algorithm as discovery-service's limiter). */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis, private readonly prefix = 'lf:v2:ratelimit:') {}

  async tryAcquire(key: string, perMinute: number): Promise<boolean> {
    const res = await this.redis.eval(SLIDING_WINDOW, 1, this.prefix + key, Date.now(), 60_000, perMinute, Math.random().toString(36).slice(2));
    return res === 1;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly now: () => number = Date.now) {}
  async tryAcquire(key: string, perMinute: number): Promise<boolean> {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => x > t - 60_000);
    if (list.length >= perMinute) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    return true;
  }
}

/**
 * Per-domain budget. Rate-limited work is not an error: the caller defers the job
 * (retry with delay) instead of blocking a worker slot for minutes.
 */
export function effectivePerMinute(configured: number, crawlDelaySeconds: number | null): number {
  if (!crawlDelaySeconds || crawlDelaySeconds <= 0) return Math.max(1, configured);
  return Math.max(1, Math.min(configured, Math.floor(60 / crawlDelaySeconds)));
}
