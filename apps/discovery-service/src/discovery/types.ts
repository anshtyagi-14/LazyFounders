import { SitemapType, DiscoveryMethod, SitemapInfo } from '@lazyfounders/shared';

export interface IDiscoveryStrategy {
  readonly name: string;
  readonly priority: number;
  discover(domain: string, baseUrl: string): Promise<SitemapInfo[]>;
}

export interface DiscoveryContext {
  domain: string;
  baseUrl: string;
  sourceId: string;
  respectRobotsTxt: boolean;
}

export interface IRobotsTxtCache {
  getSitemapUrls(domain: string): Promise<string[]>;
}
