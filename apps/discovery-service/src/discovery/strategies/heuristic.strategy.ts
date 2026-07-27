import type { Logger } from 'pino';
import { IDiscoveryStrategy } from '../types.js';
import { SitemapInfo, DiscoveryMethod, SitemapType } from '@lazyfounders/shared';
import { FetchEscalator } from '../../fetcher/fetch-escalator';

export class HeuristicStrategy implements IDiscoveryStrategy {
  public readonly name = 'heuristic';
  public readonly priority = 5;

  constructor(
    private readonly escalator: FetchEscalator,
    private readonly logger: Logger,
  ) {}

  public async discover(domain: string, baseUrl: string): Promise<SitemapInfo[]> {
    const sitemaps: SitemapInfo[] = [];

    try {
      const response = await this.escalator.fetch(baseUrl);
      if (response.statusCode !== 200) {
        this.logger.debug(`[HeuristicStrategy] Failed to fetch homepage ${baseUrl}: HTTP ${response.statusCode}`);
        return sitemaps;
      }

      const htmlBody = response.body ? response.body.toString() : '';
      const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
      
      const candidateUrls = new Set<string>();

      let match;
      while ((match = anchorRegex.exec(htmlBody)) !== null) {
        const href = match[1];
        const anchorText = match[2].toLowerCase();

        if (
          href.toLowerCase().includes('sitemap') ||
          href.toLowerCase().includes('sitemap.xml') ||
          anchorText.includes('sitemap') ||
          anchorText.includes('site map') ||
          anchorText.includes('index')
        ) {
          try {
            const absoluteUrl = new URL(href, baseUrl).href;
            if (absoluteUrl.startsWith(baseUrl)) {
              candidateUrls.add(absoluteUrl);
            }
          } catch (e) {
            // Ignore invalid URLs
          }
        }
      }

      for (const url of candidateUrls) {
        if (url.endsWith('.xml') || url.includes('sitemap')) {
          try {
            const probeRes = await this.escalator.fetch(url);
            if (probeRes.statusCode === 200) {
              const contentTypeHeader = probeRes.headers['content-type'];
              const contentType = (Array.isArray(contentTypeHeader) ? contentTypeHeader.join('') : contentTypeHeader || '').toLowerCase();
              if (contentType.includes('xml') || url.endsWith('.xml')) {
                sitemaps.push({
                  url,
                  type: SitemapType.URLSET,
                  discoveryMethod: DiscoveryMethod.HEURISTIC,
                });
              }
            }
          } catch (e) {
            this.logger.debug(`[HeuristicStrategy] Failed to probe candidate URL ${url}`);
          }
        }
      }
    } catch (error) {
      this.logger.error({ error }, `[HeuristicStrategy] Error applying heuristic strategy for ${baseUrl}`);
    }

    return sitemaps;
  }
}
