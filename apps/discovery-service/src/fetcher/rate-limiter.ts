import { Logger } from 'pino';
import Redis from 'ioredis';
import { RateLimitError } from '@lazyfounders/shared';
import { IRateLimiter } from './types.js';

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
  redis.call('PEXPIRE', key, window)
  return 1
end

return 0
`;

export class RedisRateLimiter implements IRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly defaultRpm: number,
    private readonly logger: Logger
  ) {}

  private getKey(domain: string): string {
    return `lf:ratelimit:${domain}`;
  }

  public async acquire(domain: string, rpm: number = this.defaultRpm): Promise<boolean> {
    const key = this.getKey(domain);
    const now = Date.now();
    const windowMs = 60000;

    const result = await this.redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      now,
      windowMs,
      rpm
    );

    return result === 1;
  }

  public async getWaitTime(domain: string, rpm: number = this.defaultRpm): Promise<number> {
    const key = this.getKey(domain);
    const now = Date.now();
    const windowMs = 60000;
    const clearBefore = now - windowMs;

    // Remove expired entries
    await this.redis.zremrangebyscore(key, 0, clearBefore);

    const count = await this.redis.zcard(key);
    if (count < rpm) {
      return 0; // Slot available immediately
    }

    // Get the oldest element in the window
    const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
    if (oldest && oldest.length === 2) {
      const oldestScore = parseInt(oldest[1], 10);
      return Math.max(0, oldestScore + windowMs - now);
    }

    return 0;
  }

  public async waitForSlot(domain: string, rpm: number = this.defaultRpm): Promise<void> {
    const maxWaitMs = 3600000; // 1 hour max wait time for background workers
    const startTime = Date.now();
    let currentBackoff = 100;

    while (true) {
      if (Date.now() - startTime > maxWaitMs) {
        throw new RateLimitError(`Rate limit exceeded for domain: ${domain}. Max wait time reached.`, domain, maxWaitMs);
      }

      const acquired = await this.acquire(domain, rpm);
      if (acquired) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, currentBackoff));
      currentBackoff = Math.min(currentBackoff * 2, 5000); // Max backoff 5 seconds
    }
  }

  public async reset(domain: string): Promise<void> {
    await this.redis.del(this.getKey(domain));
  }
}
