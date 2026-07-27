import { Logger } from 'pino';
import { FetchError } from '@lazyfounders/shared';
import { FetchOptions, FetchResult, IFetchStrategy } from '../types.js';
import type { Browser, BrowserContext, Page, Response } from 'playwright';

// @ts-ignore - these packages don't always have perfect TS types
import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply the stealth plugin to playwright-extra
chromium.use(stealthPlugin());

interface ClearedSession {
  context: BrowserContext;
  clearedAt: number;
  domain: string;
}

/**
 * CloudflareBypassStrategy - The Ultimate FREE Cloudflare Bypass.
 * 
 * Uses playwright-extra and puppeteer-extra-plugin-stealth to natively
 * pass Cloudflare's Turnstile JS checks.
 * 
 * 1. Launches a perfectly stealthed browser.
 * 2. Solves the Cloudflare challenge on the homepage.
 * 3. Keeps the BrowserContext alive.
 * 4. Navigates to XML/text endpoints using the SAME context.
 */
export class CloudflareBypassStrategy implements IFetchStrategy {
  public readonly name = 'cloudflare-bypass';
  public readonly priority = 2.5;

  private browser: Browser | null = null;
  private contextCache: Map<string, ClearedSession> = new Map();
  private readonly SESSION_TTL_MS = 25 * 60 * 1000; // 25 minutes

  constructor(
    private readonly config: { headless: boolean },
    private readonly logger: Logger
  ) {}

  public canHandle(url: string, previousError?: Error): boolean {
    if (!previousError) return false;
    if (previousError instanceof FetchError) {
      const status = (previousError as any).httpStatus ?? (previousError as any).statusCode;
      return status === 403 || status === 503 || status === 429;
    }
    return false;
  }

  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    const domain = new URL(url).hostname;
    const startTime = performance.now();

    const session = await this.getClearedContext(domain);
    let page: Page | null = null;

    try {
      page = await session.context.newPage();

      // Intercept raw network responses so Chrome doesn't ruin XML
      let rawBody: Buffer | null = null;
      let rawContentType: string = '';

      await page.route('**/*', async (route) => {
        await route.continue();
      });

      page.on('response', async (resp) => {
        if (resp.url() === url || resp.url() === url.replace(/\/$/, '')) {
          const ct = resp.headers()['content-type'] || '';
          if (ct.includes('xml') || ct.includes('text/plain')) {
            try {
              rawBody = await resp.body();
              rawContentType = ct;
            } catch (e) {
              // Ignore body() consumed errors
            }
          }
        }
      });

      const response: Response | null = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: options?.timeout || 45000,
      });

      if (!response) {
        throw new FetchError('No response from Cloudflare bypass', url, null, this.name);
      }

      const status = response.status();
      const headers = response.headers();

      if (status === 403 || status === 503) {
        this.logger.warn({ domain, status }, 'Cloudflare session expired or blocked, clearing context');
        await this.clearSession(domain);
        throw new FetchError(`Cloudflare bypass got ${status}`, url, status, this.name);
      }

      let bodyBuffer: Buffer;
      let contentType: string;

      if (rawBody) {
        bodyBuffer = rawBody;
        contentType = rawContentType;
      } else {
        const ct = headers['content-type'] || '';
        try {
          bodyBuffer = await response.body();
          contentType = ct;
        } catch {
          await page.waitForSelector('body', { state: 'attached', timeout: 5000 }).catch(() => {});
          const content = await page.content();
          bodyBuffer = Buffer.from(content);
          contentType = ct || 'text/html';
        }
      }

      this.logger.info({ url, status, contentType, bytes: bodyBuffer.length }, 
        '✅ Cloudflare bypass: fetched successfully with Stealth Plugin');

      return {
        url,
        finalUrl: page.url(),
        statusCode: status,
        headers: headers as Record<string, string | string[] | undefined>,
        body: bodyBuffer,
        contentType,
        contentEncoding: null, // Playwright auto-decompresses the body, so we must tell the parser it's raw
        etag: (headers['etag'] as string) || null,
        lastModified: (headers['last-modified'] as string) || null,
        isNotModified: status === 304,
        strategy: this.name,
        durationMs: performance.now() - startTime,
        byteSize: bodyBuffer.length,
      };
    } catch (error: any) {
      if (error instanceof FetchError) throw error;
      throw new FetchError(error.message || 'Cloudflare bypass error', url, null, this.name);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  private async getClearedContext(domain: string): Promise<ClearedSession> {
    const cached = this.contextCache.get(domain);
    if (cached && (Date.now() - cached.clearedAt) < this.SESSION_TTL_MS) {
      return cached;
    }

    if (cached) {
      await this.clearSession(domain);
    }

    return await this.solveCloudflareChallenge(domain);
  }

  private async solveCloudflareChallenge(domain: string): Promise<ClearedSession> {
    this.logger.info({ domain }, '🔓 Launching playwright-extra stealth browser...');

    const browser = await this.getBrowser();
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    try {
      const homepageUrl = `https://${domain}`;
      this.logger.info({ homepageUrl }, 'Visiting homepage to pass Cloudflare Turnstile...');

      await page.goto(homepageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      let attempts = 0;
      const maxAttempts = 20;

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1500));
        const cookies = await context.cookies();
        const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

        this.logger.debug({ attempt: attempts + 1, hasCfClearance }, 'Checking Cloudflare clearance...');

        if (hasCfClearance) {
          this.logger.info({ domain }, '✅ Cloudflare Turnstile solved! cf_clearance obtained.');
          break;
        }

        const title = await page.title();
        if (attempts > 3 && !title.toLowerCase().includes('just a moment') && !title.toLowerCase().includes('checking')) {
          this.logger.info({ domain, title }, '✅ Cloudflare Turnstile appears solved (page loaded).');
          break;
        }

        attempts++;
      }
      
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      await page.close().catch(() => {});
    }

    const session: ClearedSession = {
      context,
      clearedAt: Date.now(),
      domain,
    };

    this.contextCache.set(domain, session);
    return session;
  }

  private async clearSession(domain: string): Promise<void> {
    const cached = this.contextCache.get(domain);
    if (cached) {
      await cached.context.close().catch(() => {});
      this.contextCache.delete(domain);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      // Use the injected chromium from playwright-extra
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-position=0,0',
          '--ignore-certificate-errors',
        ],
      });
    }
    return this.browser!;
  }

  public async dispose(): Promise<void> {
    for (const [, session] of this.contextCache) {
      await session.context.close().catch(() => {});
    }
    this.contextCache.clear();
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
