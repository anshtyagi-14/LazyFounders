import { Logger } from 'pino';
import { FetchClient } from '../fetch-client';
import { FetchOptions, FetchResult, IFetchStrategy } from '../types';

/**
 * Basic fetch strategy using default HTTP settings.
 */
export class SimpleHttpStrategy implements IFetchStrategy {
  public readonly name = 'simple-http';
  public readonly priority = 1;

  constructor(
    private readonly fetchClient: FetchClient,
    private readonly logger: Logger
  ) {}

  /**
   * Always returns true as this is the default fallback strategy.
   */
  public canHandle(url: string, previousError?: Error): boolean {
    return true;
  }

  /**
   * Executes the fetch request using the underlying FetchClient with minimal headers.
   */
  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    this.logger.debug({ url, strategy: this.name }, 'Executing simple HTTP fetch');
    
    const headers = {
      'Accept': 'text/xml, application/xml, text/html, application/xhtml+xml, application/rss+xml, application/atom+xml',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      ...(options?.headers || {}),
    };

    const fetchOptions: FetchOptions = {
      ...options,
      headers,
    };

    const result = await this.fetchClient.fetch(url, fetchOptions);
    result.strategy = this.name;
    return result;
  }

  /**
   * Cleanup operations (no-op for simple strategy).
   */
  public async dispose(): Promise<void> {
    // No-op
  }
}
