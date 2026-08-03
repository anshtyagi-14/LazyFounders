import type { BrowserContext, Page, Browser } from 'playwright';
import { CookieConsentHandler } from './handlers/cookie-consent-handler.js';
import { LazyLoadHandler } from './handlers/lazy-load-handler.js';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { CheerioExtractor } from './extractors/cheerio-extractor.js';
import { ReadabilityExtractor } from './extractors/readability-extractor.js';
import type { Logger } from 'pino';

// @ts-ignore
chromium.use(stealth());

export async function scrapeUrlStateless(url: string, logger: Logger): Promise<any> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
    });

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    
    page = await context.newPage();

    logger.debug(`Stateless scrape: Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const cookiesAccepted = await CookieConsentHandler.acceptCookies(page);
    if (cookiesAccepted) logger.debug(`Cookie consent accepted for ${url}`);

    await LazyLoadHandler.scrollToBottom(page);
    await page.waitForTimeout(3000);

    const htmlContent = await page.content();
    
    const manualTextContent = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('p')).map(p => (p as HTMLElement).innerText).join('\n');
    });

    const cheerioExtractor = new CheerioExtractor();
    const readabilityExtractor = new ReadabilityExtractor();
    const cheerioData = cheerioExtractor.extract(htmlContent);
    const readabilityData = readabilityExtractor.extract(htmlContent, url);

    if (manualTextContent && readabilityData.textContent && manualTextContent.length > readabilityData.textContent.length * 1.5) {
        readabilityData.textContent = manualTextContent;
    } else if (manualTextContent && !readabilityData.textContent) {
        readabilityData.textContent = manualTextContent;
    }

    return {
      url,
      ...cheerioData,
      ...readabilityData,
      scrapedAt: new Date().toISOString()
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
