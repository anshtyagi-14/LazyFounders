import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@lazyfounders/logger';
import { loadConfig } from '@lazyfounders/config';

const config = loadConfig();
const prisma = new PrismaClient();
const redis = new Redis({ host: config.redis.host, port: config.redis.port, maxRetriesPerRequest: null });

const logger = createLogger({
  name: 'publishing-service',
  level: config.app.logLevel,
  prettyPrint: config.app.nodeEnv === 'development',
});

logger.info('Publishing Service started. Listening for jobs...');

const worker = new Worker('publishing-jobs', async (job: Job) => {
  logger.info(`Processing publishing job ${job.id} for OriginalContent ID: ${job.data.originalContentId}`);
  
  try {
    const content = await prisma.originalContent.findUnique({
      where: { id: job.data.originalContentId },
      include: {
        intelligenceResult: {
          include: {
            categorization: {
              include: {
                urlState: {
                  include: { source: true }
                }
              }
            }
          }
        }
      }
    });

    const domain = content?.intelligenceResult?.categorization?.urlState?.source?.domain;
    const url = content?.intelligenceResult?.categorization?.urlState?.url;
    const jobLogger = logger.child({ domain, url });

    if (!content) {
      throw new Error(`OriginalContent not found for ID: ${job.data.originalContentId}`);
    }

    // SIMULATE PUBLISHING (e.g. API call to Shopify, WordPress, Webflow, etc.)
    jobLogger.info(`Publishing "${content.seoTitle}" (slug: /${content.slug}) to CMS...`);
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mark as published in our database
    await prisma.originalContent.update({
      where: { id: content.id },
      data: { publishedToBlogAt: new Date() },
    });

    jobLogger.info(`Job ${job.id} complete. Article successfully published!`);
    
    return { success: true, publishedAt: new Date() };
  } catch (error: any) {
    logger.error({ err: error }, `Job ${job.id} failed: ${error.message}`);
    throw error;
  }
}, {
  connection: redis,
  prefix: 'lf', // Ensure prefix matches the other services
});

worker.on('error', (err) => {
  logger.error({ err }, 'BullMQ Worker Error');
});
