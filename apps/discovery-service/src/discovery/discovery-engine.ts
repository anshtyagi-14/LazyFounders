import { Logger } from 'pino';
import { SitemapInfo } from '@lazyfounders/shared';
import { IDiscoveryStrategy, DiscoveryContext } from './types';

export class DiscoveryEngine {
  private readonly strategies: IDiscoveryStrategy[];

  constructor(strategies: IDiscoveryStrategy[], private readonly logger: Logger) {
    // Sort strategies by priority ascending
    this.strategies = [...strategies].sort((a, b) => a.priority - b.priority);
  }

  public async discover(context: DiscoveryContext): Promise<SitemapInfo[]> {
    this.logger.info({ context }, 'Starting sitemap discovery');
    const allDiscovered: SitemapInfo[] = [];

    for (const strategy of this.strategies) {
      this.logger.debug({ strategy: strategy.name, context }, 'Running discovery strategy');
      try {
        const results = await strategy.discover(context.domain, context.baseUrl);
        allDiscovered.push(...results);
      } catch (error) {
        this.logger.error(
          { strategy: strategy.name, error: error instanceof Error ? error.message : error, context },
          'Strategy failed during discovery'
        );
        // Continue to next strategy even if one fails
      }
    }

    // Deduplicate by URL (case-insensitive)
    const uniqueUrls = new Set<string>();
    const deduplicated: SitemapInfo[] = [];

    for (const info of allDiscovered) {
      const normalizedUrl = info.url.toLowerCase();
      if (!uniqueUrls.has(normalizedUrl)) {
        uniqueUrls.add(normalizedUrl);
        deduplicated.push(info);
      }
    }

    this.logger.info({ context, discoveredCount: deduplicated.length }, 'Completed sitemap discovery');
    return deduplicated;
  }
}
