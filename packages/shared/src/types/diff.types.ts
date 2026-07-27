export enum ChangeType {
  NEW = 'NEW',
  UPDATED = 'UPDATED',
  REMOVED = 'REMOVED',
  RENAMED = 'RENAMED',
}

export interface DiffResult {
  url: string;
  urlHash: string;
  changeType: ChangeType;
  previousLastmod: string | null;
  currentLastmod: string | null;
  previousSlug: string | null;
  currentSlug: string | null;
  metadata: Record<string, unknown>;
}

export interface UrlStateSnapshot {
  urlHash: string;
  lastmod: string | null;
  etag: string | null;
  contentHash: string | null;
  normalizedSlug: string | null;
}
