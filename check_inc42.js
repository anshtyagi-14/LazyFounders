const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const inc42Scraped = await prisma.scrapeResult.count({
    where: { urlState: { source: { domain: 'inc42.com' } }, status: 'success' }
  });
  console.log("Successfully scraped inc42 articles:", inc42Scraped);
}
main().finally(() => prisma.$disconnect());
