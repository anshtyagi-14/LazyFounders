import { Logger } from 'pino';
import { SitemapType, DiscoveryMethod, SitemapInfo, SITEMAP_ENDPOINTS } from '@lazyfounders/shared';
import { IDiscoveryStrategy } from '../types';
import { FetchEscalator } from '../../fetcher/fetch-escalator';

export class KnownEndpointsStrategy implements IDiscoveryStrategy {
  public readonly name = 'known-endpoints';
  public readonly priority = 2;

  constructor(
    private readonly escalator: FetchEscalator,
    private readonly logger: Logger
  ) {}

  public async discover(domain: string, baseUrl: string): Promise<SitemapInfo[]> {
    this.logger.debug({ domain, baseUrl }, 'Running known endpoints discovery strategy');
    
    // Only probe STANDARD endpoints to avoid spamming
    const endpointsToProbe = (SITEMAP_ENDPOINTS as any)?.standard || (SITEMAP_ENDPOINTS as any)?.STANDARD || ['/sitemap.xml', '/sitemap_index.xml'];
    
    const results: SitemapInfo[] = [];
    
    // Normalize base URL to not have a trailing slash
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

    const probePromises = endpointsToProbe.map(async (endpoint: string) => {
      // Ensure endpoint starts with /
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const url = `${normalizedBaseUrl}${normalizedEndpoint}`;
      
      try {
        // Request as stream so we can destroy it once headers are read
        const response = await this.escalator.fetch(url, { responseType: 'stream' });
        
        // Immediately abort the stream since we just need headers/status
        if (response.body && typeof (response.body as any).destroy === 'function') {
           (response.body as any).destroy();
        }
        
        const contentType = response.headers?.['content-type'] || '';
        const isXml = contentType.includes('xml') || contentType.includes('text');
        
        if (response.statusCode === 200 && isXml) {
          return {
            url,
            type: SitemapType.URLSET,
            discoveryMethod: DiscoveryMethod.ENDPOINT_PROBE
          } as SitemapInfo;
        }
      } catch (error) {
         this.logger.debug(
           { url, error: error instanceof Error ? error.message : String(error) }, 
           'Probe failed or returned non-200'
         );
      }
      return null;
    });

    const probes = await Promise.all(probePromises);
    
    for (const probe of probes) {
      if (probe) {
        results.push(probe);
      }
    }

    return results;
  }
}
