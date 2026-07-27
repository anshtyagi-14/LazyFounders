import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

async function main() {
  console.log('Connecting to Redis...');
  const redis = new Redis('redis://localhost:6379');
  const queue = new Queue('scraper-jobs', { connection: redis });
  
  const sourceId = '21d608f7-bf66-423a-ae7d-3800d6d61ad5'; // Inc42
  const urls = [
    'https://inc42.com/features/startups-indian-gaming-industry/',
    'https://inc42.com/buzz/ola-electric-ipo-everything-you-need-to-know/',
    'https://inc42.com/startups/how-this-bengaluru-based-startup-is-building-ai-for-legal-tech/'
  ];

  for (const url of urls) {
    await queue.add('scrape', {
        url,
        domain: 'inc42.com',
        urlHash: Buffer.from(url).toString('base64'),
        sourceId,
        discoveredAt: new Date().toISOString(),
        changeType: 'NEW',
        metadata: { priority: 5 }
    });
    console.log(`Bypassed Discovery & Enqueued directly to BullMQ: ${url}`);
  }
  
  await redis.quit();
}

main().catch(console.error);
