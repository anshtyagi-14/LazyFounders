import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const redis = new Redis({ host: 'localhost', port: 6379 });
  const scraperQueue = new Queue('scraper-jobs', {
    connection: redis,
    prefix: 'lf',
  });

  // Get YourStory source
  const source = await prisma.source.findFirst({
    where: { name: 'YourStory' }
  });

  const url = 'https://yourstory.com/2023/11/funding-saas-startup-series-a-investment';

  console.log(`Pushing job to scrape ${url}`);

  await scraperQueue.add('scrape-job', {
    url,
    sourceId: source?.id || 'unknown',
    urlHash: Buffer.from(url).toString('base64'),
    changeType: 'NEW'
  });

  console.log('Done!');
  process.exit(0);
}

main();
