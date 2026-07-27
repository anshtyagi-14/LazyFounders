import { Logger } from 'pino';
import { FetchError, BotDetectionError } from '@lazyfounders/shared';
import { FetchOptions, IFetchStrategy, IRateLimiter, IRobotsTxtCache, EscalationResult } from './types.js';
import { URL } from 'url';

export class FetchEscalator {
  private readonly strategies: IFetchStrategy[];

  constructor(
    strategies: IFetchStrategy[],
    private readonly rateLimiter: IRateLimiter,
    private readonly robotsTxtCache: IRobotsTxtCache,
    private readonly logger: Logger
  ) {
    this.strategies = strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Fetches a URL, escalating through strategies on bot detection errors.
   */
  public async fetch(
    url: string,
    options?: FetchOptions & { respectRobotsTxt?: boolean; rateLimit?: number }
  ): Promise<EscalationResult> {
    const domain = new URL(url).hostname;
    const respectRobotsTxt = options?.respectRobotsTxt ?? true;
    const attemptedStrategies: string[] = [];

    if (respectRobotsTxt) {
      const isAllowed = await this.robotsTxtCache.isAllowed(url, options?.userAgent);
      if (!isAllowed) {
        throw new FetchError(`URL blocked by robots.txt: ${url}`, url, 403, 'escalator');
      }
      const crawlDelay = await this.robotsTxtCache.getCrawlDelay(domain, options?.userAgent);
      // Optional: adjust rate limit based on crawlDelay if present.
    }

    await this.rateLimiter.waitForSlot(domain, options?.rateLimit);

    let lastError: Error | undefined;

    for (const strategy of this.strategies) {
      if (lastError && !strategy.canHandle(url, lastError)) {
        continue; // Skip strategy if it cannot handle the previous error
      }

      attemptedStrategies.push(strategy.name);
      this.logger.info({ url, strategy: strategy.name }, 'Attempting fetch strategy');

      try {
        const result = await strategy.fetch(url, options);
        return {
          ...result,
          attemptedStrategies,
          escalationReason: lastError ? lastError.message : null,
        };
      } catch (error: any) {
        lastError = error;

        const isBotDetection =
          error instanceof BotDetectionError ||
          (error instanceof FetchError && [403, 503, 429].includes(error.statusCode || 0));

        if (!isBotDetection) {
          // Do not escalate for general network errors, 404s, etc.
          throw error;
        }

        this.logger.warn({ url, strategy: strategy.name, error: error.message }, 'Strategy failed, evaluating escalation');
      }
    }

    throw new FetchError(
      `All fetch strategies exhausted. Attempted: ${attemptedStrategies.join(', ')}. Last error: ${lastError?.message}`,
      url,
      null,
      'escalator'
    );
  }

  /**
   * Disposes all strategies and releases resources.
   */
  public async dispose(): Promise<void> {
    for (const strategy of this.strategies) {
      await strategy.dispose();
    }
  }
}
