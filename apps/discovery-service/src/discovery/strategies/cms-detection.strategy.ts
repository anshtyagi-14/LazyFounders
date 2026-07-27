import type { Logger } from 'pino';
import { IDiscoveryStrategy } from '../types.js';
import { SitemapInfo, DiscoveryMethod, SitemapType } from '@lazyfounders/shared';
import { CMS_SIGNATURES } from '@lazyfounders/shared';
import { FetchEscalator } from '../../fetcher/fetch-escalator';

export class CmsDetectionStrategy implements IDiscoveryStrategy {
  public readonly name = 'cms-detection';
  public readonly priority = 3;

  constructor(
    private readonly escalator: FetchEscalator,
    private readonly logger: Logger,
  ) {}

  public async discover(domain: string, baseUrl: string): Promise<SitemapInfo[]> {
    const sitemaps: SitemapInfo[] = [];
    try {
      // Fetch homepage to detect CMS
      const response = await this.escalator.fetch(baseUrl);
      if (response.statusCode !== 200) {
        this.logger.debug(`[CmsDetectionStrategy] Failed to fetch homepage ${baseUrl}: HTTP ${response.statusCode}`);
        return sitemaps;
      }

      const headers = response.headers || {};
      const htmlBody = response.body ? response.body.toString() : '';

      const detectedCmsList: any[] = [];

      for (const signature of CMS_SIGNATURES as any[]) {
        let confidence = 0;
        const strategies = signature.detectionStrategies;

        if (strategies) {
          // Check headers
          if (strategies.headerPatterns) {
            for (const pattern of strategies.headerPatterns) {
              const regex = new RegExp(pattern, 'i');
              for (const [headerName, headerValue] of Object.entries(headers)) {
                if (headerValue && regex.test(String(headerValue))) {
                  confidence += 0.5;
                  break;
                }
              }
            }
          }

          // Check meta tags
          if (strategies.metaPatterns) {
            for (const pattern of strategies.metaPatterns) {
              const metaRegex = new RegExp(`<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*${pattern.source || pattern}[^"']*["']`, 'i');
              if (metaRegex.test(htmlBody)) {
                confidence += 0.5;
              }
            }
          }

          // Check HTML patterns
          if (strategies.htmlPatterns) {
            for (const pattern of strategies.htmlPatterns) {
              if (new RegExp(pattern, 'i').test(htmlBody)) {
                confidence += 0.5;
              }
            }
          }
        }

        if (confidence >= 0.5) {
          detectedCmsList.push(signature);
          this.logger.info(`[CmsDetectionStrategy] Detected CMS: ${signature.name} (confidence: ${confidence})`);
        }
      }

      for (const signature of detectedCmsList) {
        const endpoints = signature.detectionStrategies?.sitemapPaths || [];
        for (const endpoint of endpoints) {
          const url = new URL(endpoint, baseUrl).href;
          try {
            const probeRes = await this.escalator.fetch(url);
            if (probeRes.statusCode === 200) {
              sitemaps.push({
                url,
                type: SitemapType.URLSET,
                discoveryMethod: DiscoveryMethod.CMS_DETECTION,
              });
            }
          } catch (e) {
            this.logger.debug(`[CmsDetectionStrategy] Failed to probe CMS endpoint ${url}`);
          }
        }
      }
    } catch (error) {
      this.logger.error({ error }, `[CmsDetectionStrategy] Error applying CMS strategy for ${baseUrl}`);
    }
    return sitemaps;
  }
}
