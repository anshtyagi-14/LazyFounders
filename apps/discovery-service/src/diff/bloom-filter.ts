import { Redis } from 'ioredis';
import { Logger } from 'pino';

export class RedisBloomFilter {
  private redis: Redis;
  private logger: Logger;

  constructor(redis: Redis, logger: Logger) {
    this.redis = redis;
    this.logger = logger.child({ component: 'RedisBloomFilter' });
  }

  /**
   * Checks if a URL is known in the domain's set.
   * @param domain The domain of the URL.
   * @param url The URL to check.
   * @returns A promise that resolves to true if known, false otherwise.
   */
  public async isKnown(domain: string, url: string): Promise<boolean> {
    try {
      const key = `${domain}:known_urls`;
      const result = await this.redis.sismember(key, url);
      return result === 1;
    } catch (error) {
      this.logger.error({ err: error, domain, url }, 'Error checking if URL is known in Redis');
      throw error;
    }
  }

  /**
   * Marks a URL as known in the domain's set.
   * @param domain The domain of the URL.
   * @param url The URL to mark.
   */
  public async markKnown(domain: string, url: string): Promise<void> {
    try {
      const key = `${domain}:known_urls`;
      await this.redis.sadd(key, url);
    } catch (error) {
      this.logger.error({ err: error, domain, url }, 'Error marking URL as known in Redis');
      throw error;
    }
  }
}
