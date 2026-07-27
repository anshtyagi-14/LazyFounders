import { Logger } from 'pino';
import { FetchError, BotDetectionError } from '@lazyfounders/shared';
import { FetchOptions, FetchResult, IFetchStrategy, ProxyConfig } from '../types.js';
import { FetchClient } from '../fetch-client.js';
import crypto from 'crypto';

export interface ResidentialProxyOptions {
  provider: 'brightdata' | 'smartproxy' | 'oxylabs' | 'custom';
  country?: string;
  sessionId?: string;
  sessionDuration?: number;
}

export class ResidentialProxyStrategy implements IFetchStrategy {
  public readonly name = 'residential-proxy';
  public readonly priority = 6;

  constructor(
    private readonly fetchClient: FetchClient,
    private readonly proxyConfig: ProxyConfig,
    private readonly providerOptions: ResidentialProxyOptions,
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

  private generateSessionId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private buildProxyConfig(): ProxyConfig {
    const { provider, country, sessionId = this.generateSessionId() } = this.providerOptions;
    const { username, password, host, port, protocol } = this.proxyConfig;

    let modifiedUsername = username || '';

    if (provider === 'brightdata') {
      modifiedUsername = `${username}-country-${country || 'us'}-session-${sessionId}`;
    } else if (provider === 'oxylabs') {
      modifiedUsername = `customer-${username}-cc-${country || 'us'}-sessid-${sessionId}`;
    }

    return {
      host,
      port,
      protocol,
      username: modifiedUsername,
      password,
    };
  }

  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    this.logger.debug({ url, provider: this.providerOptions.provider }, 'Fetching using residential proxy strategy');

    const configuredProxy = this.buildProxyConfig();

    const fetchOptions: FetchOptions = {
      ...options,
      proxy: configuredProxy,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...options?.headers,
      }
    };

    if (this.providerOptions.provider === 'smartproxy' && this.providerOptions.country) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'country': this.providerOptions.country,
      };
    }

    return this.fetchClient.fetch(url, fetchOptions);
  }

  public async dispose(): Promise<void> {
    // No-op
  }
}
