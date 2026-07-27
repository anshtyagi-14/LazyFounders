const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const urls = await prisma.urlState.count();
  const scrapes = await prisma.scrapeResult.count();
  const cats = await prisma.categorizationResult.count();
  console.log(`URL States: ${urls}, Scrapes: ${scrapes}, Cats: ${cats}`);
  process.exit(0);
}
check();
