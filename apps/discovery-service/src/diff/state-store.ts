import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { createHash } from 'crypto';

export class RedisStateStore {
  private redis: Redis;
  private logger: Logger;

  constructor(redis: Redis, logger: Logger) {
    this.redis = redis;
    this.logger = logger.child({ component: 'RedisStateStore' });
  }

  private hashUrl(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }

  private extractSlug(url: string): string {
    try {
      const parsedUrl = new URL(url);
      // Remove trailing slash, split by /, get last non-empty segment
      const segments = parsedUrl.pathname.replace(/\/$/, '').split('/').filter(Boolean);
      if (segments.length === 0) return parsedUrl.pathname;
      const lastSegment = segments[segments.length - 1];
      // Strip common extensions
      return lastSegment.replace(/\.(html?|php|aspx?|jsp)$/i, '').toLowerCase();
    } catch {
      return url;
    }
  }

  /**
   * Retrieves the stored state for a given URL.
   * @param domain The domain of the URL.
   * @param url The URL to retrieve state for.
   * @returns An object containing lastmod and slug, or null if not found.
   */
  public async getUrlState(domain: string, url: string): Promise<{ lastmod?: string; slug?: string } | null> {
    try {
      const key = `${domain}:url_state:${this.hashUrl(url)}`;
      const result = await this.redis.hgetall(key);
      
      if (Object.keys(result).length === 0) {
        return null;
      }
      
      return {
        lastmod: result.lastmod,
        slug: result.slug
      };
    } catch (error) {
      this.logger.error({ err: error, domain, url }, 'Error getting URL state from Redis');
      throw error;
    }
  }

  /**
   * Stores the state for a given URL.
   * @param domain The domain of the URL.
   * @param url The URL to store.
   * @param lastmod The last modification date.
   */
  public async setUrlState(domain: string, url: string, lastmod?: Date): Promise<void> {
    try {
      const key = `${domain}:url_state:${this.hashUrl(url)}`;
      const slug = this.extractSlug(url);
      
      const data: Record<string, string> = { slug };
      if (lastmod) {
        data.lastmod = lastmod.toISOString();
      }

      await this.redis.hset(key, data);
    } catch (error) {
      this.logger.error({ err: error, domain, url }, 'Error setting URL state in Redis');
      throw error;
    }
  }

  /**
   * Finds a URL by its slug.
   * @param domain The domain.
   * @param slug The slug to search for.
   * @returns The matching URL, or null if not found.
   */
  public async findUrlBySlug(domain: string, slug: string): Promise<string | null> {
    try {
      const key = `${domain}:slug_index:${slug}`;
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error({ err: error, domain, slug }, 'Error finding URL by slug in Redis');
      throw error;
    }
  }

  /**
   * Updates the index mapping a slug to a URL.
   * @param domain The domain.
   * @param slug The slug.
   * @param url The URL.
   */
  public async updateSlugIndex(domain: string, slug: string, url: string): Promise<void> {
    try {
      const key = `${domain}:slug_index:${slug}`;
      await this.redis.set(key, url);
    } catch (error) {
      this.logger.error({ err: error, domain, slug, url }, 'Error updating slug index in Redis');
      throw error;
    }
  }
}
