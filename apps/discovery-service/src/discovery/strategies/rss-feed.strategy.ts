import type { Logger } from 'pino';
import { IDiscoveryStrategy } from '../types.js';
import { SitemapInfo, DiscoveryMethod, SitemapType } from '@lazyfounders/shared';
import { SITEMAP_ENDPOINTS } from '@lazyfounders/shared';
import { FetchEscalator } from '../../fetcher/fetch-escalator';

export class RssFeedStrategy implements IDiscoveryStrategy {
  public readonly name = 'rss-feed';
  public readonly priority = 4;

  constructor(
    private readonly escalator: FetchEscalator,
    private readonly logger: Logger,
  ) {}

  public async discover(domain: string, baseUrl: string): Promise<SitemapInfo[]> {
    const sitemaps: SitemapInfo[] = [];
    const endpoints = (SITEMAP_ENDPOINTS as any).rss || (SITEMAP_ENDPOINTS as any).RSS_ATOM || ['/feed', '/rss', '/rss.xml', '/atom.xml'];

    // 1. Probe common endpoints concurrently
    const probePromises = endpoints.map(async (endpoint: string) => {
      const url = new URL(endpoint, baseUrl).href;
      try {
        const res = await this.escalator.fetch(url);
        if (res.statusCode === 200) {
          const contentTypeHeader = res.headers['content-type'];
          const contentType = (Array.isArray(contentTypeHeader) ? contentTypeHeader.join('') : contentTypeHeader || '').toLowerCase();
          if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
            const isAtom = url.includes('atom');
            sitemaps.push({
              url,
              type: isAtom ? SitemapType.ATOM : SitemapType.RSS,
              discoveryMethod: isAtom ? (DiscoveryMethod as any).ATOM_FEED || DiscoveryMethod.RSS_FEED : DiscoveryMethod.RSS_FEED,
            });
          }
        }
      } catch (error) {
        this.logger.debug(`[RssFeedStrategy] Failed to probe endpoint ${url}`);
      }
    });

    await Promise.all(probePromises);

    // 2. Parse homepage HTML for <link rel="alternate">
    try {
      const homeRes = await this.escalator.fetch(baseUrl);
      if (homeRes.statusCode === 200) {
        const htmlBody = homeRes.body ? homeRes.body.toString() : '';
        const linkRegex = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
        let match;
        
        while ((match = linkRegex.exec(htmlBody)) !== null) {
          const tag = match[0];
          if (tag.includes('application/rss+xml') || tag.includes('application/atom+xml')) {
            const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
            if (hrefMatch && hrefMatch[1]) {
              const url = new URL(hrefMatch[1], baseUrl).href;
              const isAtom = tag.includes('atom');
              
              if (!sitemaps.some(s => s.url === url)) {
                sitemaps.push({
                  url,
                  type: isAtom ? SitemapType.ATOM : SitemapType.RSS,
                  discoveryMethod: isAtom ? (DiscoveryMethod as any).ATOM_FEED || DiscoveryMethod.RSS_FEED : DiscoveryMethod.RSS_FEED,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error({ error }, `[RssFeedStrategy] Error applying RSS strategy for ${baseUrl}`);
    }

    return sitemaps;
  }
}
