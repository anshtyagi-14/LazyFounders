const { Queue } = require('bullmq');
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');

const redis = new Redis();
const prisma = new PrismaClient();

async function getStats(name) {
  const q = new Queue(name, { connection: redis, prefix: 'lf' });
  const counts = await q.getJobCounts('wait', 'active', 'completed', 'failed');
  await q.close();
  return counts;
}

async function main() {
  console.log("--- QUEUE STATS ---");
  console.log("Scraper:", await getStats('scraper-jobs'));
  console.log("Categorization:", await getStats('categorization-jobs'));
  console.log("Intelligence:", await getStats('intelligence-jobs'));
  console.log("Publishing:", await getStats('publishing-jobs'));
  
  console.log("\n--- DATABASE TALLY ---");
  console.log("Total Discovered URLs:", await prisma.urlState.count());
  console.log("Successfully Scraped:", await prisma.scrapeResult.count());
  console.log("Categorized:", await prisma.categorizationResult.count());
  console.log("Intelligence (Deduplicated):", await prisma.intelligenceResult.count());
  console.log("Original Content (Fully Rewritten):", await prisma.originalContent.count());
  
  redis.disconnect();
  await prisma.$disconnect();
}
main();
