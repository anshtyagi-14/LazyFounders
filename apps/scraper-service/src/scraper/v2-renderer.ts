import { chromium, type Browser } from 'playwright';
import { TerminalError, type HeadlessRenderer } from '@lazyfounders/ingestion-core';

const MAX_HTML_BYTES = Number(process.env.FETCH_MAX_BYTES_HTML || 5 * 1024 * 1024);

/**
 * Headless rendering for v2 sources with renderPolicy "fallback" or "required".
 * Plain Chromium with an honest user agent: no stealth plugins, no CAPTCHA solving, no
 * proxies. Every request the page makes is checked against the source allowlist and
 * the SSRF guard; anything else (third-party trackers, internal addresses) is aborted.
 */
export class PlaywrightRenderer implements HeadlessRenderer {
  private browser: Promise<Browser> | null = null;

  private launch(): Promise<Browser> {
    this.browser ??= chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    return this.browser;
  }

  async render(url: string, opts: { assertAllowed: (url: string) => Promise<void>; timeoutMs: number }): Promise<string> {
    await opts.assertAllowed(url);
    const browser = await this.launch();
    const context = await browser.newContext({
      userAgent: process.env.CRAWLER_USER_AGENT ?? 'LazyFoundersBot/1.0 (+https://lazyfounders.com/bot)',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    try {
      await context.route('**/*', async (route) => {
        const req = route.request();
        if (['image', 'media', 'font', 'stylesheet', 'websocket'].includes(req.resourceType())) return route.abort();
        try {
          await opts.assertAllowed(req.url());
          return route.continue();
        } catch {
          return route.abort();
        }
      });
      const page = await context.newPage();
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
      const status = res?.status() ?? 0;
      if (status === 401 || status === 403 || status === 451) throw new TerminalError(`Access restricted (${status})`, 'http_blocked');
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      const html = await page.content();
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new TerminalError('Rendered page too large', 'response_too_large');
      return html;
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
    this.browser = null;
  }
}
