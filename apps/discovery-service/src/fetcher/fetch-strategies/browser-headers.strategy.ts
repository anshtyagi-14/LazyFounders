import { Logger } from 'pino';
import { FetchError, BotDetectionError } from '@lazyfounders/shared';
import { FetchClient } from '../fetch-client';
import { UserAgentRotator } from '../user-agent-rotator';
import { FetchOptions, FetchResult, IFetchStrategy } from '../types';

/**
 * Fetch strategy that mimics a real browser by adding comprehensive headers.
 */
export class BrowserHeadersStrategy implements IFetchStrategy {
  public readonly name = 'browser-headers';
  public readonly priority = 2;

  constructor(
    private readonly fetchClient: FetchClient,
    private readonly userAgentRotator: UserAgentRotator,
    private readonly logger: Logger
  ) {}

  /**
   * Evaluates if this strategy should handle the request based on previous failures.
   *
   * @param url - The target URL.
   * @param previousError - The error from a previously attempted strategy, if any.
   * @returns true if it handles BotDetectionError or specific HTTP status errors (403/503).
   */
  public canHandle(url: string, previousError?: Error): boolean {
    if (!previousError) {
      return false; // Typically only used if previous strategy failed
    }

    if (previousError instanceof BotDetectionError) {
      return true;
    }

    if (previousError instanceof FetchError) {
      const status = previousError.httpStatus;
      if (status === 403 || status === 503) {
        return true;
      }
    }

    return false;
  }

  /**
   * Executes the fetch with full browser-like headers.
   */
  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    this.logger.debug({ url, strategy: this.name }, 'Executing browser headers fetch');

    const domain = new URL(url).hostname;
    const userAgent = this.userAgentRotator.getForDomain(domain);
    const isMobile = userAgent.includes('Mobile');
    const platform = userAgent.includes('Windows') ? '"Windows"' : (userAgent.includes('Mac') ? '"macOS"' : '"Linux"');

    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
      'sec-ch-ua-platform': platform,
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
   * Cleanup operations.
   */
  public async dispose(): Promise<void> {
    // No-op
  }
}
