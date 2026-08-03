import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { BedrockClient } from '../llm/bedrock-client.js';
import { ImageProcessor } from './image-processor.js';

export interface IntelligenceJobData {
  categorizationResultId: string;
}

export class IntelligenceWorker {
  private worker: Worker<IntelligenceJobData, any, string>;
  private publishQueue: Queue;
  private readonly queueName = 'intelligence-jobs';
  private bedrockClient: BedrockClient;
  private imageProcessor: ImageProcessor;

  constructor(
    private readonly redis: Redis,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {
    this.bedrockClient = new BedrockClient(logger);
    this.imageProcessor = new ImageProcessor(logger);

    // Queue for sending to Stage 6 (Publishing)
    this.publishQueue = new Queue('publishing-jobs', {
      connection: this.redis,
      prefix: 'lf',
    });

    this.worker = new Worker<IntelligenceJobData, any, string>(
      this.queueName,
      this.processJob.bind(this),
      {
        connection: this.redis,
        prefix: 'lf',
        concurrency: 2, // Low concurrency to avoid AWS throttling
        limiter: {
          max: 10,
          duration: 60000 // Strictly 10 full rewrites per minute
        }
      }
    );

    this.setupListeners();
  }

  private setupListeners(): void {
    this.worker.on('completed', (job: Job) => {
      this.logger.info(`Job ${job.id} completed successfully for categorizationResultId: ${job.data.categorizationResultId}`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const jobId = job ? job.id : 'unknown';
      this.logger.error({ error: err.message, stack: err.stack }, `Job ${jobId} failed for categorizationResultId: ${job?.data?.categorizationResultId}`);
    });
  }

  private async processJob(job: Job<IntelligenceJobData>): Promise<void> {
    const { categorizationResultId } = job.data;
    
    if (!categorizationResultId) {
      throw new Error('categorizationResultId is required in job data');
    }

    this.logger.info(`Starting intelligence job ${job.id} for categorizationResultId: ${categorizationResultId}`);

    // Fetch the categorization result + scrape result
    const catResult = await this.prisma.categorizationResult.findUnique({
      where: { id: categorizationResultId },
      include: {
        scrapeResult: true,
        urlState: { include: { source: true } }
      }
    });

    if (!catResult || !catResult.scrapeResult) {
      throw new Error(`Data not found for categorizationResultId: ${categorizationResultId}`);
    }

    const { scrapeResult, primaryCategory, summary, urlState } = catResult;
    const domain = urlState?.source?.domain;
    const jobLogger = this.logger.child({ domain, url: urlState?.url });

    if (!scrapeResult.bodyText || !primaryCategory || !summary) {
      jobLogger.warn({ categorizationResultId }, 'Skipping due to missing bodyText, category, or summary');
      return;
    }

    // --- PHASE 1: DEDUPLICATION ---
    
    // Fetch last 20 original contents in this category to check for duplicates
    const recentOriginals = await this.prisma.originalContent.findMany({
      where: {
        intelligenceResult: {
          categorization: {
            primaryCategory: primaryCategory
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        intelligenceResult: {
          include: {
            categorization: true
          }
        }
      }
    });

    const recentArticlesForLlm = recentOriginals.map(ro => ({
      id: ro.intelligenceResultId, // Using intelligence ID as reference
      title: ro.seoTitle,
      summary: ro.intelligenceResult.categorization.summary || ''
    }));

    jobLogger.debug(`Checking deduplication against ${recentArticlesForLlm.length} recent articles in category ${primaryCategory}`);
    
    const dedupResult = await this.bedrockClient.checkDuplicate(
      scrapeResult.title || 'Untitled',
      summary,
      recentArticlesForLlm
    );

    // Save Deduplication Result (using upsert so retries don't fail)
    const intelligenceResult = await this.prisma.intelligenceResult.upsert({
      where: { categorizationId: categorizationResultId },
      update: {
        isDuplicate: dedupResult.isDuplicate,
        duplicateOfId: dedupResult.duplicateOfId
      },
      create: {
        categorizationId: categorizationResultId,
        isDuplicate: dedupResult.isDuplicate,
        duplicateOfId: dedupResult.duplicateOfId
      }
    });

    if (dedupResult.isDuplicate) {
      this.logger.info({ categorizationResultId, duplicateOfId: dedupResult.duplicateOfId }, 'Article flagged as DUPLICATE. Skipping rewrite.');
      return; // Stop here, we don't write duplicates!
    }

    // --- PHASE 2: REWRITE (INTELLIGENCE) ---
    this.logger.info(`Article is unique. Passing to LLM for SEO rewrite...`);

    const rewritten = await this.bedrockClient.rewriteArticle(
      scrapeResult.bodyText,
      primaryCategory
    );

    // --- PHASE 3: EXTRACT & WATERMARK IMAGE ---
    let headerImageUrl = null;
    
    jobLogger.debug({ 
      openGraph: scrapeResult.openGraph, 
      images: scrapeResult.images,
      imagesIsArray: Array.isArray(scrapeResult.images)
    }, 'Extracting header image from scrape result');

    if (scrapeResult.openGraph && typeof scrapeResult.openGraph === 'object') {
      const og = scrapeResult.openGraph as Record<string, any>;
      if (og['og:image']) {
        headerImageUrl = og['og:image'];
      }
    }
    
    if (!headerImageUrl && scrapeResult.images) {
      // Prisma JSON fields might come back as strings if poorly parsed, or objects
      let parsedImages = scrapeResult.images;
      if (typeof parsedImages === 'string') {
        try { parsedImages = JSON.parse(parsedImages); } catch (e) {}
      }
      
      if (Array.isArray(parsedImages) && parsedImages.length > 0) {
        const imagesArr = parsedImages as any[];
        headerImageUrl = imagesArr[0].src || imagesArr[0];
      }
    }

    jobLogger.info({ headerImageUrl }, 'Final extracted header image URL');

    let watermarkedImagePath: string | null = null;
    if (headerImageUrl && typeof headerImageUrl === 'string' && headerImageUrl.startsWith('http')) {
      watermarkedImagePath = await this.imageProcessor.processAndWatermark(headerImageUrl, intelligenceResult.id);
    }

    // Ensure slug is globally unique to prevent Prisma constraint errors
    const uniqueSlug = `${rewritten.slug}-${intelligenceResult.id.split('-')[0]}`;

    // Save OriginalContent to DB (upsert for retries)
    const originalContent = await this.prisma.originalContent.upsert({
      where: { intelligenceResultId: intelligenceResult.id },
      update: {
        seoTitle: rewritten.seoTitle,
        slug: uniqueSlug,
        bodyHtml: rewritten.bodyMarkdown,
        metaDescription: rewritten.metaDescription,
        keywords: rewritten.keywords,
        companies: rewritten.companies || [],
        headerImage: watermarkedImagePath
      },
      create: {
        intelligenceResultId: intelligenceResult.id,
        seoTitle: rewritten.seoTitle,
        slug: uniqueSlug,
        bodyHtml: rewritten.bodyMarkdown,
        metaDescription: rewritten.metaDescription,
        keywords: rewritten.keywords,
        companies: rewritten.companies || [],
        headerImage: watermarkedImagePath
      }
    });

    jobLogger.info(`Successfully generated SEO content & watermarked image: ${originalContent.seoTitle}`);

    // Push to Publishing Queue
    await this.publishQueue.add('publish-article', {
      originalContentId: originalContent.id
    }, {
      jobId: originalContent.id, // Idempotency key
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    jobLogger.info(`Pushed originalContentId ${originalContent.id} to publishing queue`);
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

