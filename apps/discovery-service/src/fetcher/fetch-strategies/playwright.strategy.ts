import { Logger } from 'pino';
import { FetchError, BotDetectionError } from '@lazyfounders/shared';
import { FetchOptions, FetchResult, IFetchStrategy } from '../types';
import type { Browser, Page, Response } from 'playwright';

/**
 * Advanced fallback fetch strategy utilizing Playwright for rendering Javascript and evading bots.
 * Lazily loads the Playwright module and browser instance to conserve resources.
 */
export class PlaywrightStrategy implements IFetchStrategy {
  public readonly name = 'playwright';
  public readonly priority = 3;

  private browser: Browser | null = null;
  private playwrightModule: any = null;

  constructor(
    private readonly config: { headless: boolean },
    private readonly logger: Logger
  ) {}

  /**
   * Determines if this strategy should attempt to handle a request.
   */
  public canHandle(url: string, previousError?: Error): boolean {
    if (!previousError) {
      return false;
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
   * Initializes the browser instance lazily.
   */
  private async initBrowser(): Promise<Browser> {
    if (!this.playwrightModule) {
      this.logger.debug('Dynamically importing playwright module');
      this.playwrightModule = await import('playwright');
    }

    if (!this.browser) {
      this.logger.info('Launching playwright browser instance');
      this.browser = await this.playwrightModule.chromium.launch({
        headless: this.config.headless,
      });
    }

    if (!this.browser) {
      throw new Error('Failed to launch browser');
    }
    return this.browser;
  }

  /**
   * Executes the fetch using Playwright.
   */
  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    this.logger.debug({ url, strategy: this.name }, 'Executing Playwright fetch');
    const startTime = performance.now();
    let page: Page | null = null;

    try {
      const browser = await this.initBrowser();
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: options?.userAgent,
        extraHTTPHeaders: options?.headers,
        ignoreHTTPSErrors: true,
      });

      page = await context.newPage();

      const response: Response | null = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: options?.timeout || 30000,
      });

      if (!response) {
        throw new FetchError('Failed to get a response from Playwright goto', url, null, this.name);
      }

      const status = response.status();
      const headers = response.headers();

      if (status >= 400) {
        throw new FetchError(`Playwright fetch failed with status ${status}`, url, status, this.name);
      }

      const contentTypeHeader = headers['content-type'] || '';
      let bodyBuffer: Buffer;

      // If it's XML or plain text, intercept the raw network response to prevent Chrome from rendering it as HTML
      if (contentTypeHeader.includes('xml') || contentTypeHeader.includes('text/plain')) {
        this.logger.debug('Intercepting raw network response for XML/Text');
        bodyBuffer = await response.body();
      } else {
        // For HTML, we want the JS-evaluated DOM
        await page.waitForSelector('body', { state: 'attached', timeout: 5000 }).catch(() => {});
        const content = await page.content();
        bodyBuffer = Buffer.from(content);
      }

      const durationMs = performance.now() - startTime;

      await page.close();

      return {
        url,
        finalUrl: page.url(),
        statusCode: status,
        headers: headers as Record<string, string | string[] | undefined>,
        body: bodyBuffer,
        contentType: headers['content-type'] || 'text/html', // Fallback as mostly HTML
        contentEncoding: headers['content-encoding'] || null,
        etag: headers['etag'] || null,
        lastModified: headers['last-modified'] || null,
        isNotModified: status === 304,
        strategy: this.name,
        durationMs,
        byteSize: bodyBuffer.length,
      };
    } catch (error: any) {
      if (page) {
        await page.close().catch(() => {});
      }

      if (error instanceof FetchError) {
        throw error;
      }
      
      throw new FetchError(
        error.message || 'Playwright fetch error',
        url,
        null,
        this.name,
        { cause: error }
      );
    }
  }

  /**
   * Cleans up the Playwright browser instance.
   */
  public async dispose(): Promise<void> {
    if (this.browser) {
      this.logger.info('Closing playwright browser instance');
      await this.browser.close();
      this.browser = null;
    }
  }
}
