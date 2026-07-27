import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const redis = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

console.log('Publishing Service started. Listening for jobs...');

const worker = new Worker('publishing-jobs', async (job: Job) => {
  console.log(`Processing publishing job ${job.id} for OriginalContent ID: ${job.data.originalContentId}`);
  
  try {
    const content = await prisma.originalContent.findUnique({
      where: { id: job.data.originalContentId },
    });

    if (!content) {
      throw new Error(`OriginalContent not found for ID: ${job.data.originalContentId}`);
    }

    // SIMULATE PUBLISHING (e.g. API call to Shopify, WordPress, Webflow, etc.)
    console.log(`Publishing "${content.seoTitle}" (slug: /${content.slug}) to CMS...`);
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mark as published in our database
    await prisma.originalContent.update({
      where: { id: content.id },
      data: { publishedToBlogAt: new Date() },
    });

    console.log(`Job ${job.id} complete. Article successfully published!`);
    
    return { success: true, publishedAt: new Date() };
  } catch (error: any) {
    console.error(`Job ${job.id} failed:`, error.message);
    throw error;
  }
}, {
  connection: redis,
  prefix: 'lf', // Ensure prefix matches the other services
});

worker.on('error', (err) => {
  console.error('BullMQ Worker Error:', err);
});
