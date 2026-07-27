import { ChangeType } from './diff.types';

export interface QueueJob {
  traceId: string;
  sourceId: string;
  domain: string;
  url: string;
  urlHash: string;
  lastmod: string | null;
  changeType: ChangeType;
  titleHint: string | null;
  newsPublicationDate: string | null;
  discoveredAt: string;
  metadata: Record<string, unknown>;
}

export interface QueueAdapter {
  enqueue(queueName: string, job: QueueJob): Promise<string>;
  enqueueBatch(queueName: string, jobs: QueueJob[]): Promise<string[]>;
  close(): Promise<void>;
}

export const QueueNames = {
  DISCOVERY_NEW_URLS: 'discovery-new-urls',
  SCRAPER_JOBS: 'scraper-jobs',
  CATEGORIZATION_JOBS: 'categorization-jobs',
  INTELLIGENCE_JOBS: 'intelligence-jobs',
  PUBLISHING_JOBS: 'publishing-jobs'
} as const;
