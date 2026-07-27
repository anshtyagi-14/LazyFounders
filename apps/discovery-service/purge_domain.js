const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

const prisma = new PrismaClient();
const redis = new Redis({ host: 'localhost', port: 6379 });

async function main() {
  const domain = 'inc42.com'; // Adjust if they meant a different one
  console.log(`Purging domain: ${domain}`);

  // 1. Delete from Postgres
  const source = await prisma.source.findUnique({
    where: { domain }
  });

  if (source) {
    console.log(`Found source in Postgres. Deleting everything under source: ${source.id}...`);
    // Cascade delete will wipe UrlState, ScrapeResult, CrawlRun, etc.
    await prisma.source.delete({
      where: { id: source.id }
    });
    console.log(`Postgres deletion complete.`);
  } else {
    console.log(`Source not found in Postgres.`);
  }

  // 2. Delete from Redis (Bloom Filter & State Store)
  const bloomKey = `bf:lf:discovery:${domain}`;
  const stateKey = `hash:lf:discovery:${domain}`;
  
  const bloomDeleted = await redis.del(bloomKey);
  const stateDeleted = await redis.del(stateKey);
  
  console.log(`Redis purge: deleted bloom filter (${bloomDeleted}) and state store (${stateDeleted})`);

  console.log(`Successfully purged ${domain} from the entire system!`);
}

main().finally(() => {
  prisma.$disconnect();
  redis.disconnect();
});
