import { Logger } from 'pino';
import { SitemapType, DiscoveryMethod, SitemapInfo } from '@lazyfounders/shared';
import { IDiscoveryStrategy, IRobotsTxtCache } from '../types';

export class RobotsTxtDiscoveryStrategy implements IDiscoveryStrategy {
  public readonly name = 'robots-txt';
  public readonly priority = 1;

  constructor(
    private readonly robotsTxtCache: IRobotsTxtCache,
    private readonly logger: Logger
  ) {}

  public async discover(domain: string, baseUrl: string): Promise<SitemapInfo[]> {
    this.logger.debug({ domain, baseUrl }, 'Running robots.txt discovery strategy');
    try {
      const urls = await this.robotsTxtCache.getSitemapUrls(domain);
      
      return urls.map(url => ({
        url,
        type: SitemapType.URLSET, // Default, will be corrected later in parser
        discoveryMethod: DiscoveryMethod.ROBOTS_TXT
      }));
    } catch (error) {
      this.logger.error(
        { domain, error: error instanceof Error ? error.message : error },
        'Error retrieving sitemap URLs from robots.txt cache'
      );
      return [];
    }
  }
}
