export interface CrawlPolicy {
  respectRobotsTxt: boolean;
  maxConcurrentRequests: number;
  requestDelayMs: number;
  maxRetries: number;
  customHeaders: Record<string, string>;
}

export interface SourceConfig {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  crawlFrequency: string;
  enabled: boolean;
  priority: number;
  category: string | null;
  customSitemapUrls: string[];
  proxyEnabled: boolean;
  customHeaders: Record<string, string> | null;
  crawlPolicy: CrawlPolicy | null;
  customFilterRules: string[] | null;
  recencyWindowHours: number;
  createdAt: Date;
  updatedAt: Date;
  lastCrawledAt: Date | null;
}

export type CreateSourceInput = Omit<SourceConfig, 'id' | 'createdAt' | 'updatedAt' | 'lastCrawledAt'>;
export type UpdateSourceInput = Partial<CreateSourceInput>;
