import { Logger } from 'pino';
import { BotDetectionError } from '@lazyfounders/shared';
import { FetchOptions, FetchResult, IFetchStrategy } from '../types.js';
import type { Browser, BrowserContext, Page } from 'playwright';

export class PlaywrightStealthStrategy implements IFetchStrategy {
  public readonly name = 'playwright-stealth';
  public readonly priority = 4;
  private browser: Browser | null = null;

  constructor(
    private readonly config: { headless: boolean },
    private readonly logger: Logger
  ) {}

  public canHandle(url: string, previousError?: Error): boolean {
    return previousError instanceof BotDetectionError;
  }

  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    const startTime = Date.now();
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      if (!this.browser) {
        const { chromium } = await import('playwright');
        this.browser = await chromium.launch({
          headless: this.config.headless,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
          ],
        });
      }

      context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        timezoneId: 'America/New_York',
        locale: 'en-US',
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });

      page = await context.newPage();

      // Random delay before navigation
      const delay = Math.floor(Math.random() * 600) + 200; // 200-800ms
      await new Promise((resolve) => setTimeout(resolve, delay));

      const response = await page.goto(url, { waitUntil: 'networkidle' });
      
      // Wait additional 1-3 seconds for JS
      const jsDelay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise((resolve) => setTimeout(resolve, jsDelay));

      const content = await page.content();
      const buffer = Buffer.from(content, 'utf-8');

      const headers = response?.headers() || {};
      const statusCode = response?.status() || 200;

      return {
        url,
        finalUrl: page.url(),
        statusCode,
        headers,
        body: buffer,
        contentType: headers['content-type'] || 'text/html',
        contentEncoding: headers['content-encoding'] || null,
        etag: headers['etag'] || null,
        lastModified: headers['last-modified'] || null,
        isNotModified: statusCode === 304,
        strategy: this.name,
        durationMs: Date.now() - startTime,
        byteSize: buffer.length,
      };
    } catch (error) {
      this.logger.error({ url, error }, 'Playwright stealth fetch failed');
      throw error;
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }

  public async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
