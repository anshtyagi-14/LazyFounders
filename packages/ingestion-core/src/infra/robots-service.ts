import { BlockedError, PipelineError } from '../errors';
import { EMPTY_RULES, isAllowedByPolicy, parseRobots, type RobotsPolicy } from '../net/robots';
import type { SafeFetcher } from '../net/safe-fetch';

/**
 * robots.txt cache per origin (in-process, 12h). Uses the same SafeFetcher as the
 * article fetch, so robots requests obey the same SSRF and domain rules.
 */
export class RobotsService {
  private readonly cache = new Map<string, { at: number; policy: RobotsPolicy }>();

  constructor(private readonly userAgent = process.env.CRAWLER_USER_AGENT ?? 'LazyFoundersBot', private readonly ttlMs = 12 * 3600_000) {}

  async policyFor(url: string, fetcher: SafeFetcher): Promise<RobotsPolicy> {
    const origin = new URL(url).origin;
    const hit = this.cache.get(origin);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.policy;

    let policy: RobotsPolicy;
    try {
      const res = await fetcher.fetch({ url: `${origin}/robots.txt`, maxBytes: 512 * 1024 });
      policy = { status: 'parsed', rules: parseRobots(res.body.toString('utf8'), this.userAgent) };
    } catch (err) {
      const status = (err as PipelineError).details?.status as number | undefined;
      if (err instanceof PipelineError && err.code === 'http_error' && status && status >= 400 && status < 500) {
        policy = { status: 'none', rules: EMPTY_RULES }; // RFC 9309: 4xx => no restrictions
      } else if (err instanceof BlockedError) {
        policy = { status: 'none', rules: EMPTY_RULES }; // 401/403 on robots.txt => treated as unavailable (allow)
      } else {
        policy = { status: 'unreachable', rules: EMPTY_RULES };
      }
    }
    this.cache.set(origin, { at: Date.now(), policy });
    return policy;
  }

  async check(url: string, fetcher: SafeFetcher, robotsRequired: boolean): Promise<{ allowed: boolean; crawlDelaySeconds: number | null }> {
    const policy = await this.policyFor(url, fetcher);
    return { allowed: isAllowedByPolicy(policy, url, robotsRequired), crawlDelaySeconds: policy.rules.crawlDelaySeconds };
  }
}
