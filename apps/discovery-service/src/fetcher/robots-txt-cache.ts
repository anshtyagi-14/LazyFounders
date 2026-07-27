import { Logger } from 'pino';
import Redis from 'ioredis';
import { FetchClient } from './fetch-client.js';
import { IRobotsTxtCache } from './types.js';
import { URL } from 'url';

export interface RobotsTxtRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

export interface ParsedRobotsTxt {
  sitemapUrls: string[];
  rules: RobotsTxtRule[];
  crawlDelays: Record<string, number>;
  fetchedAt: string;
}

export class RobotsTxtCache implements IRobotsTxtCache {
  constructor(
    private readonly fetchClient: FetchClient,
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly ttlSeconds: number = 86400
  ) {}

  private getKey(domain: string): string {
    return `lf:robots:${domain}`;
  }

  private async fetchAndParse(domain: string): Promise<ParsedRobotsTxt> {
    const defaultRobots: ParsedRobotsTxt = {
      sitemapUrls: [],
      rules: [{ userAgent: '*', allow: ['/'], disallow: [] }],
      crawlDelays: {},
      fetchedAt: new Date().toISOString()
    };

    try {
      const result = await this.fetchClient.fetch(`https://${domain}/robots.txt`, {
        timeout: 10000,
        followRedirects: true,
      });

      if (result.statusCode >= 400) {
        return defaultRobots;
      }

      return this.parseRobotsTxt(result.body.toString('utf-8'));
    } catch (error) {
      this.logger.warn({ domain, error: (error as Error).message }, 'Failed to fetch robots.txt, using defaults');
      return defaultRobots;
    }
  }

  private parseRobotsTxt(content: string): ParsedRobotsTxt {
    const result: ParsedRobotsTxt = {
      sitemapUrls: [],
      rules: [],
      crawlDelays: {},
      fetchedAt: new Date().toISOString()
    };

    const lines = content.split(/\r?\n/);
    let currentUserAgents: string[] = [];
    let currentAllow: string[] = [];
    let currentDisallow: string[] = [];

    const saveCurrentBlock = () => {
      if (currentUserAgents.length > 0) {
        for (const ua of currentUserAgents) {
          result.rules.push({
            userAgent: ua,
            allow: [...currentAllow],
            disallow: [...currentDisallow]
          });
        }
      }
      currentUserAgents = [];
      currentAllow = [];
      currentDisallow = [];
    };

    for (let line of lines) {
      // Remove comments
      line = line.split('#')[0].trim();
      if (!line) continue;

      const parts = line.split(':');
      if (parts.length < 2) continue;
      
      const key = parts[0];
      const value = parts.slice(1).join(':').trim();
      const lowerKey = key.trim().toLowerCase();

      if (lowerKey === 'user-agent') {
        if (currentAllow.length > 0 || currentDisallow.length > 0) {
          saveCurrentBlock();
        }
        currentUserAgents.push(value.toLowerCase());
      } else if (lowerKey === 'allow') {
        currentAllow.push(value);
      } else if (lowerKey === 'disallow') {
        currentDisallow.push(value);
      } else if (lowerKey === 'sitemap') {
        result.sitemapUrls.push(value);
      } else if (lowerKey === 'crawl-delay') {
        const delay = parseFloat(value);
        if (!isNaN(delay)) {
          for (const ua of currentUserAgents.length ? currentUserAgents : ['*']) {
            result.crawlDelays[ua] = delay;
          }
        }
      }
    }

    saveCurrentBlock();
    return result;
  }

  private async getOrFetch(domain: string): Promise<ParsedRobotsTxt> {
    const key = this.getKey(domain);
    const cached = await this.redis.get(key);

    if (cached) {
      try {
        return JSON.parse(cached) as ParsedRobotsTxt;
      } catch (e) {
        this.logger.warn({ domain }, 'Failed to parse cached robots.txt');
      }
    }

    const parsed = await this.fetchAndParse(domain);
    await this.redis.set(key, JSON.stringify(parsed), 'EX', this.ttlSeconds);
    return parsed;
  }

  public async isAllowed(url: string, userAgent: string = '*'): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;
      const path = parsedUrl.pathname + parsedUrl.search;
      
      const parsed = await this.getOrFetch(domain);
      
      let applicableRules = parsed.rules.filter(r => r.userAgent === userAgent.toLowerCase());
      if (applicableRules.length === 0) {
        applicableRules = parsed.rules.filter(r => r.userAgent === '*');
      }
      
      if (applicableRules.length === 0) {
        return true;
      }

      let longestAllow = -1;
      let longestDisallow = -1;

      for (const rule of applicableRules) {
        for (const allow of rule.allow) {
          if (this.pathMatches(allow, path) && allow.length > longestAllow) {
            longestAllow = allow.length;
          }
        }
        for (const disallow of rule.disallow) {
          if (this.pathMatches(disallow, path) && disallow.length > longestDisallow) {
            longestDisallow = disallow.length;
          }
        }
      }

      if (longestAllow > longestDisallow) {
        return true;
      }
      if (longestDisallow > longestAllow || longestDisallow >= 0) {
        return false;
      }

      return true;
    } catch (e) {
      return true; // fail open
    }
  }

  private pathMatches(rulePath: string, testPath: string): boolean {
    if (rulePath === '' || rulePath === '*') return true;
    if (rulePath === '/') return testPath.startsWith('/');
    
    // Replace '*' with '.*' and escape other regex chars
    const regexStr = rulePath
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
      
    // If it ends with $, match the end, otherwise match prefix
    const finalRegex = rulePath.endsWith('$') 
      ? new RegExp(`^${regexStr.slice(0, -2)}$`)
      : new RegExp(`^${regexStr}`);
      
    return finalRegex.test(testPath);
  }

  public async getCrawlDelay(domain: string, userAgent: string = '*'): Promise<number | null> {
    const parsed = await this.getOrFetch(domain);
    if (parsed.crawlDelays[userAgent.toLowerCase()] !== undefined) {
      return parsed.crawlDelays[userAgent.toLowerCase()];
    }
    if (parsed.crawlDelays['*'] !== undefined) {
      return parsed.crawlDelays['*'];
    }
    return null;
  }

  public async getSitemapUrls(domain: string): Promise<string[]> {
    const parsed = await this.getOrFetch(domain);
    return parsed.sitemapUrls;
  }

  public async refresh(domain: string): Promise<void> {
    await this.clear(domain);
    await this.getOrFetch(domain);
  }

  public async clear(domain: string): Promise<void> {
    await this.redis.del(this.getKey(domain));
  }
}
