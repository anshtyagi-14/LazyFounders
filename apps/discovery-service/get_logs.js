const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const crawlRun = await prisma.crawlRun.findFirst({
    where: { source: { domain: 'inc42.com' } },
    orderBy: { startedAt: 'desc' }
  });
  console.log("Crawl Run status:", crawlRun.status, "duration:", (new Date() - crawlRun.startedAt)/1000, "seconds");
  const errors = await prisma.crawlError.findMany({ where: { crawlRunId: crawlRun.id } });
  console.log("Errors:", errors);
}
main().finally(() => prisma.$disconnect());
