'use server';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const categorizationQueue = new Queue('categorization-jobs', {
  connection: redis,
  prefix: 'lf',
});

export async function triggerPipeline(url: string) {
  try {
    if (!url) throw new Error('URL is required');

    let source = await prisma.source.findFirst({
      where: { name: 'YourStory' }
    });

    if (!source) {
      // Fallback
      source = await prisma.source.findFirst();
    }

    if (!source) {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      source = await prisma.source.create({
        data: {
          name: domain,
          domain: domain,
          baseUrl: urlObj.origin,
          recencyWindowHours: 168
        }
      });
    }

    const urlHash = Buffer.from(url).toString('base64');

    await prisma.urlState.upsert({
      where: { urlHash },
      create: {
        url,
        urlHash,
        sourceId: source?.id || 'unknown',
        changeType: 'NEW',
        status: 'new'
      },
      update: {
        changeType: 'NEW',
        status: 'active',
        updatedAt: new Date()
      }
    });

    const job = await categorizationQueue.add('categorize-job', {
      url,
      sourceId: source?.id || 'unknown',
      urlHash,
      changeType: 'NEW'
    });

    return {
      success: true,
      jobId: job.id,
      urlHash
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function checkPipelineStatus(urlHash: string) {
  try {
    // Check url_states for the given hash
    const urlState = await prisma.urlState.findUnique({
      where: { urlHash }
    });

    if (!urlState) {
      return { status: 'PENDING', message: 'Waiting for scraper to pick up job...' };
    }

    // Check categorization
    const catResult = await prisma.categorizationResult.findUnique({
      where: { urlStateId: urlState.id }
    });

    if (!catResult) {
      return { status: 'CATEGORIZING', message: 'Categorizing content using LLM...' };
    }

    // Check scrape_results
    const scrapeResult = await prisma.scrapeResult.findUnique({
      where: { categorizationId: catResult.id }
    });

    if (!scrapeResult) {
      // It might have been skipped if irrelevant!
      const isRelevant = ['startup', 'technology', 'ai', 'finance', 'business', 'health'].some(c => (catResult.primaryCategory || '').toLowerCase().includes(c));
      if (!isRelevant) {
        return { status: 'DONE', message: `Article discarded (Irrelevant category: ${catResult.primaryCategory})` };
      }
      return { status: 'SCRAPING', message: 'Extracting content using Playwright...' };
    }

    // Check intelligence
    const intelResult = await prisma.intelligenceResult.findUnique({
      where: { categorizationId: catResult.id }
    });

    if (!intelResult) {
      return { status: 'INTELLIGENCE', message: 'Deduplicating and rewriting...' };
    }

    if (intelResult.isDuplicate) {
      return { status: 'DONE', message: 'Article processed (Duplicate found - no rewrite needed)' };
    }

    // Check original content
    const originalContent = await prisma.originalContent.findUnique({
      where: { intelligenceResultId: intelResult.id }
    });

    if (originalContent) {
      return { 
        status: 'DONE', 
        message: 'Pipeline complete!',
        data: originalContent 
      };
    }

    return { status: 'PUBLISHING', message: 'Finalizing SEO rewrite...' };
    
  } catch (error: any) {
    return { status: 'ERROR', message: error.message };
  }
}

export async function triggerDiscovery(url: string) {
  try {
    if (!url) throw new Error('URL is required');

    // Normalize URL to domain to see if we have a source
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    
    let source = await prisma.source.findUnique({
      where: { domain }
    });

    if (!source) {
      // Create a temporary source
      source = await prisma.source.create({
        data: {
          name: domain,
          domain: domain,
          baseUrl: urlObj.origin,
          recencyWindowHours: 168 // Enforce 7 days max age
        }
      });
    }

    // Trigger the discovery service REST API directly
    await fetch(`http://localhost:3001/sources/${source.id}/discover`, {
      method: 'POST'
    });

    return {
      success: true,
      sourceId: source.id
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function checkDiscoveryStatus(sourceId: string) {
  try {
    const crawlRun = await prisma.crawlRun.findFirst({
      where: { sourceId },
      orderBy: { startedAt: 'desc' }
    });

    if (!crawlRun) {
      return { status: 'PENDING', message: 'Waiting for discovery engine to start...' };
    }

    if (crawlRun.status === 'running') {
      return { 
        status: 'CRAWLING', 
        message: `Crawling sitemaps... Found ${crawlRun.totalUrls} total URLs so far.` 
      };
    }

    // Finished
    const newUrls = await prisma.urlState.findMany({
      where: {
        sourceId,
        changeType: 'NEW',
        createdAt: {
          gte: crawlRun.startedAt
        }
      },
      select: {
        url: true,
        titleHint: true,
        firstSeenAt: true
      },
      take: 5000 // Ensure we can fetch all of them so it doesn't get stuck
    });

    const jobCounts = await categorizationQueue.getJobCounts('wait', 'active', 'delayed');
    const totalPendingJobs = jobCounts.wait + jobCounts.active + jobCounts.delayed;

    if (newUrls.length < crawlRun.newUrls && totalPendingJobs > 0) {
      return { 
        status: 'SYNCING', 
        message: `Crawl complete! Discovered ${crawlRun.newUrls} new articles. Waiting for Categorization Workers... (${newUrls.length}/${crawlRun.newUrls})` 
      };
    }

    return {
      status: 'DONE',
      message: `Sync complete! Discovered ${crawlRun.newUrls} new articles.`,
      data: {
        totalCrawled: crawlRun.totalUrls,
        newArticlesCount: crawlRun.newUrls,
        newArticles: newUrls
      }
    };
  } catch (error: any) {
    return { status: 'ERROR', message: error.message };
  }
}

export async function getSystemHealth() {
  try {
    const getQueueStats = async (queueName: string) => {
      const q = new Queue(queueName, { connection: redis, prefix: 'lf' });
      const counts = await q.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
      await q.close();
      return {
        ...counts,
        wait: counts.wait + (counts.delayed || 0) // Treat rate-limited delayed jobs as waiting
      };
    };

    const [scraper, categorization, intelligence, publishing] = await Promise.all([
      getQueueStats('scraper-jobs'),
      getQueueStats('categorization-jobs'),
      getQueueStats('intelligence-jobs'),
      getQueueStats('publishing-jobs')
    ]);

    const [urls, scrapes, cats, intels, contents] = await Promise.all([
      prisma.urlState.count(),
      prisma.scrapeResult.count(),
      prisma.categorizationResult.count(),
      prisma.intelligenceResult.count(),
      prisma.originalContent.count()
    ]);

    return {
      success: true,
      queues: { scraper, categorization, intelligence, publishing },
      database: { urls, scrapes, cats, intels, contents }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
