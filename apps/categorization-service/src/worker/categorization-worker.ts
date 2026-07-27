import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { BedrockClient } from '../llm/bedrock-client.js';

export interface CategorizationJobData {
  urlHash: string;
  url: string;
  sourceId: string;
  changeType?: string;
}

export class CategorizationWorker {
  private worker: Worker<CategorizationJobData, any, string>;
  private scraperQueue: Queue;
  private readonly queueName = 'categorization-jobs';
  private bedrockClient: BedrockClient;

  constructor(
    private readonly redis: Redis,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {
    this.bedrockClient = new BedrockClient(logger);

    this.scraperQueue = new Queue('scraper-jobs', {
      connection: this.redis,
      prefix: 'lf',
    });

    this.worker = new Worker<CategorizationJobData, any, string>(
      this.queueName,
      this.processJob.bind(this),
      {
        connection: this.redis,
        prefix: 'lf',
        concurrency: 2, // AWS Bedrock might have rate limits, keeping concurrency low
        limiter: {
          max: 15,
          duration: 60000 // Strictly 15 categorizations per minute
        }
      }
    );

    this.setupListeners();
  }

  private setupListeners(): void {
    this.worker.on('completed', (job: Job) => {
      this.logger.info(`Job ${job.id} completed successfully for scrapeResultId: ${job.data.scrapeResultId}`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const jobId = job ? job.id : 'unknown';
      this.logger.error({ error: err.message, stack: err.stack }, `Job ${jobId} failed for scrapeResultId: ${job?.data?.scrapeResultId}`);
    });
  }

  private async processJob(job: Job<CategorizationJobData>): Promise<void> {
    const { urlHash, url, sourceId, changeType } = job.data;
    
    if (!urlHash || !url) {
      throw new Error('urlHash and url are required in job data');
    }

    this.logger.info(`Starting categorization job ${job.id} for urlHash: ${urlHash}`);

    // Fetch the UrlState from the DB
    const urlState = await this.prisma.urlState.findUnique({
      where: { urlHash },
    });

    if (!urlState) {
      throw new Error(`UrlState not found for urlHash: ${urlHash}`);
    }

    try {
      // 1. Call Bedrock LLM using ONLY the URL
      const aiResult = await this.bedrockClient.categorizeByUrl(url);

      // 2. Save result to DB
      const catResult = await this.prisma.categorizationResult.upsert({
        where: { urlStateId: urlState.id },
        update: {
          primaryCategory: aiResult.primaryCategory,
          tags: aiResult.tags,
          summary: aiResult.summary,
          entities: aiResult.entities,
          sentiment: aiResult.sentiment,
          confidenceScore: aiResult.confidenceScore,
          categorizedAt: new Date()
        },
        create: {
          urlStateId: urlState.id,
          primaryCategory: aiResult.primaryCategory,
          tags: aiResult.tags,
          summary: aiResult.summary,
          entities: aiResult.entities,
          sentiment: aiResult.sentiment,
          confidenceScore: aiResult.confidenceScore
        }
      });

      this.logger.info(`Successfully categorized urlHash ${urlHash} as ${aiResult.primaryCategory}`);

      // Filter: Only send Startups, Tech, AI, Finance, etc. to Scraper
      const category = (aiResult.primaryCategory || '').toLowerCase();
      const allowedCategories = ['startup', 'technology', 'ai', 'finance', 'business', 'health'];
      
      const isRelevant = allowedCategories.some(c => category.includes(c));

      if (isRelevant) {
        // Push to Scraper Queue
        await this.scraperQueue.add('scrape-job', {
          categorizationId: catResult.id,
          url,
          sourceId,
          urlHash,
          changeType
        }, {
          jobId: catResult.id, // Idempotent
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        });
        this.logger.info(`Pushed categorizationId ${catResult.id} to scraper queue`);
      } else {
        this.logger.info(`Discarded urlHash ${urlHash} due to irrelevant category: ${aiResult.primaryCategory}`);
      }

    } catch (err: any) {
      this.logger.error({ err }, `Failed to categorize article for urlHash: ${urlHash}`);
      throw err;
    }
  }

  public async close(): Promise<void> {
    await this.worker.close();
    await this.scraperQueue.close();
  }
}
