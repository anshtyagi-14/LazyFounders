import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import type { BrowserContext, Page, Browser } from 'playwright';
import { CookieConsentHandler } from './handlers/cookie-consent-handler';
import { LazyLoadHandler } from './handlers/lazy-load-handler';

import type { Logger } from 'pino';

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealth());

/**
 * Interface for the job data structure expected by the ScraperWorker.
 */
export interface ScrapeJobData {
  url: string;
  sourceId: string;
  categorizationId: string;
  urlHash?: string;
  changeType?: string;
  domain?: string;
  [key: string]: any;
}

import { CheerioExtractor } from './extractors/cheerio-extractor.js';
import { ReadabilityExtractor } from './extractors/readability-extractor.js';
/**
 * ScraperWorker is responsible for processing scraping jobs.
 * It manages the BullMQ worker, launches Playwright, coordinates handlers,
 * and saves the extracted results to the database.
 */
export class ScraperWorker {
  private worker: Worker<ScrapeJobData>;
  private intelligenceQueue: Queue;

  constructor(
    private readonly redis: Redis,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {
    this.worker = new Worker<ScrapeJobData>(
      'scraper-jobs',
      async (job) => this.processJob(job),
      {
        connection: this.redis,
        prefix: 'lf', // The prefix used in config
        concurrency: parseInt(process.env.SCRAPER_CONCURRENCY || '2', 10), // Limit Playwright concurrency for memory-constrained instances
      }
    );

    this.intelligenceQueue = new Queue('intelligence-jobs', {
      connection: new Redis(this.redis.options),
      prefix: 'lf'
    });

    this.setupListeners();
  }

  /**
   * Sets up event listeners for the BullMQ worker.
   */
  private setupListeners(): void {
    this.worker.on('completed', (job: Job) => {
      this.logger.info(`Job ${job.id} completed successfully for URL: ${job.data.url}`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const jobId = job ? job.id : 'unknown';
      const url = job?.data?.url || 'unknown URL';
      this.logger.error({ error: err.message, stack: err.stack }, `Job ${jobId} failed for URL: ${url}`);
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error({ error: err.message, stack: err.stack }, 'BullMQ Worker Error');
    });
  }

  /**
   * Core logic to process a single scraping job.
   *
   * @param job - The BullMQ job containing the URL to scrape.
   * @returns A promise that resolves when the job is completely processed.
   */
  private async processJob(job: Job<ScrapeJobData>): Promise<void> {
    const { url, categorizationId } = job.data;
    
    if (!url || !categorizationId) {
      throw new Error('URL and categorizationId are required in job data');
    }

    this.logger.info(`Starting scrape job ${job.id} for URL: ${url}`);
    
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

      // Navigate to the target URL
      this.logger.debug(`Navigating to ${url}`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000 // 30 seconds navigation timeout
      });

      // Handle Cookie Consents
      this.logger.debug(`Attempting to handle cookie consent for ${url}`);
      const cookiesAccepted = await CookieConsentHandler.acceptCookies(page);
      if (cookiesAccepted) {
          this.logger.debug(`Cookie consent accepted for ${url}`);
      }

      // Handle Lazy Loading
      this.logger.debug(`Simulating scrolling for lazy load on ${url}`);
      await LazyLoadHandler.scrollToBottom(page);

      // Wait for client-side rendering to finish (especially for sites like YourStory)
      await page.waitForTimeout(3000);

      // Extract the full HTML content
      this.logger.debug(`Extracting HTML content for ${url}`);
      const htmlContent = await page.content();
      
      // Attempt manual extraction of P tags (bypasses Readability limitations)
      const manualTextContent = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('p')).map(p => p.innerText).join('\n');
      });

      // Delegate extraction
      const cheerioExtractor = new CheerioExtractor();
      const readabilityExtractor = new ReadabilityExtractor();
      const cheerioData = cheerioExtractor.extract(htmlContent);
      const readabilityData = readabilityExtractor.extract(htmlContent, url);

      // Prefer manual P tag text if it's significantly longer than Readability's output (fixes YourStory)
      if (manualTextContent && readabilityData.textContent && manualTextContent.length > readabilityData.textContent.length * 1.5) {
          readabilityData.textContent = manualTextContent;
      } else if (manualTextContent && !readabilityData.textContent) {
          readabilityData.textContent = manualTextContent;
      }

      // Combine extracted data
      const article = {
        url,
        ...cheerioData,
        ...readabilityData,
        scrapedAt: new Date().toISOString()
      };

      const sourceId = job.data.sourceId;
      const urlHash = job.data.urlHash || Buffer.from(url).toString('base64');
      const changeType = job.data.changeType || 'NEW';

      if (!sourceId || sourceId === 'unknown') {
        this.logger.warn(`No valid sourceId provided for ${url}, logging extracted data instead of saving to DB`);
        this.logger.info({ article }, 'Extracted article data');
      } else {
        // 2. Save the final extraction output
        const a = article as any;
        const scrapeData = {
            traceId: job.id || 'unknown',
            title: a.title,
            bodyText: a.textContent ? a.textContent.substring(0, 50000) : null, 
            bodyHtml: a.htmlContent ? a.htmlContent.substring(0, 100000) : null,
            author: a.author || a.byline || a.authors?.join(', ') || null,
            publishedDate: a.publishedDate || a.publishedTime ? new Date(a.publishedDate || a.publishedTime) : null,
            wordCount: a.wordCount || null,
            readingTimeMin: a.readingTime || null,
            images: a.images || null,
            openGraph: a.openGraph || null,
            status: 'success',
            extractionMethod: 'playwright+readability',
            rawHtmlSize: htmlContent.length
        };

        const scrapeResult = await this.prisma.scrapeResult.upsert({
          where: { categorizationId },
          update: scrapeData,
          create: {
            categorizationId,
            ...scrapeData
          }
        });

        this.logger.info({
          bodyTextLength: scrapeResult.bodyText?.length,
          type: typeof scrapeResult.bodyText,
          hasBodyText: !!scrapeResult.bodyText
        }, 'Checking bodyText before queuing');

        // 3. Queue for Intelligence Engine
        if (scrapeResult.bodyText) {
          await this.intelligenceQueue.add('intelligence-job', {
            categorizationResultId: categorizationId
          }, {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 }
          });
          this.logger.debug({ categorizationId }, 'Queued for intelligence');
        }

        this.logger.info({ categorizationId, title: article.title }, 'Successfully saved extracted article data to database');
      }

    } catch (error: any) {
      this.logger.error({ error: error.message }, `Failed to process job ${job.id} for URL: ${url}`);
      throw error; // Rethrow to mark job as failed in BullMQ
    } finally {
      // Ensure browser resources are cleaned up regardless of success or failure
      if (page) {
        await page.close().catch((e) => this.logger.warn(`Failed to close page: ${e.message}`));
      }
      if (context) {
        await context.close().catch((e) => this.logger.warn(`Failed to close context: ${e.message}`));
      }
      if (browser) {
        await browser.close().catch((e) => this.logger.warn(`Failed to close browser: ${e.message}`));
      }
    }
  }
  
  /**
   * Gracefully shuts down the worker.
   */
  public async close(): Promise<void> {
    await this.worker.close();
    await this.intelligenceQueue.close();
  }
}
