import type { Readable } from 'node:stream';

/** Options for a fetch request */
export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  decompress?: boolean;
  proxy?: ProxyConfig | null;
  userAgent?: string;
  etag?: string | null;
  ifModifiedSince?: string | null;
  responseType?: 'buffer' | 'stream' | 'text';
}

/** Result of a successful fetch */
export interface FetchResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  contentType: string | null;
  contentEncoding: string | null;
  etag: string | null;
  lastModified: string | null;
  isNotModified: boolean;
  strategy: string;
  durationMs: number;
  byteSize: number;
}

/** Proxy server configuration */
export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

/** Interface that all fetch strategies must implement */
export interface IFetchStrategy {
  readonly name: string;
  readonly priority: number;
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
  canHandle(url: string, previousError?: Error): boolean;
  dispose(): Promise<void>;
}

/** Per-domain rate limiter interface */
export interface IRateLimiter {
  acquire(domain: string, rpm?: number): Promise<boolean>;
  getWaitTime(domain: string, rpm?: number): Promise<number>;
  waitForSlot(domain: string, rpm?: number): Promise<void>;
  reset(domain: string): Promise<void>;
}

/** robots.txt cache and query interface */
export interface IRobotsTxtCache {
  isAllowed(url: string, userAgent?: string): Promise<boolean>;
  getCrawlDelay(domain: string, userAgent?: string): Promise<number | null>;
  getSitemapUrls(domain: string): Promise<string[]>;
  refresh(domain: string): Promise<void>;
  clear(domain: string): Promise<void>;
}

/** Options for creating the HTTP fetch client */
export interface FetchClientConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  maxRedirects: number;
  keepAlive: boolean;
  maxSockets: number;
}

/** Escalation result showing which strategy succeeded */
export interface EscalationResult extends FetchResult {
  attemptedStrategies: string[];
  escalationReason: string | null;
}
