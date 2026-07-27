const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

const prisma = new PrismaClient();
const redis = new Redis(); // default localhost:6379

async function main() {
  console.log('Starting full database wipe...');
  
  // 1. Delete all sources (this cascades to CrawlRun, UrlState, ScrapeResult, etc.)
  const result = await prisma.source.deleteMany({});
  console.log(`Deleted ${result.count} sources from PostgreSQL (cascaded to all other tables).`);
  
  // 2. Flush entire Redis database (clears BullMQ queues, Bloom Filters, State Stores)
  await redis.flushdb();
  console.log('Flushed Redis database (all queues and caches cleared).');
  
  console.log('Database and queues completely reset.');
}

main().finally(() => {
  prisma.$disconnect();
  redis.disconnect();
});
