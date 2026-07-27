import { Logger } from 'pino';
import { FetchError, BotDetectionError } from '@lazyfounders/shared';
import { FetchOptions, FetchResult, IFetchStrategy, ProxyConfig } from '../types.js';
import { FetchClient } from '../fetch-client.js';

export class ProxyStrategy implements IFetchStrategy {
  public readonly name = 'proxy';
  public readonly priority = 5;

  constructor(
    private readonly fetchClient: FetchClient,
    private readonly proxyConfig: ProxyConfig,
    private readonly logger: Logger
  ) {}

  public canHandle(url: string, previousError?: Error): boolean {
    if (previousError instanceof BotDetectionError) {
      return true;
    }
    if (previousError instanceof FetchError) {
      return previousError.statusCode === 403 || previousError.statusCode === 429;
    }
    return false;
  }

  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    this.logger.debug({ url, proxy: this.proxyConfig.host }, 'Fetching using proxy strategy');
    
    const fetchOptions: FetchOptions = {
      ...options,
      proxy: this.proxyConfig,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        ...options?.headers,
      }
    };

    return this.fetchClient.fetch(url, fetchOptions);
  }

  public async dispose(): Promise<void> {
    // No-op
  }
}
