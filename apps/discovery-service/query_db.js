const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const urlCount = await prisma.urlState.count({ where: { source: { domain: 'inc42.com' } } });
  console.log("inc42 url count:", urlCount);
  
  const crawlRuns = await prisma.crawlRun.findMany({
    where: { source: { domain: 'inc42.com' } },
    orderBy: { startedAt: 'desc' },
    take: 2
  });
  console.log(crawlRuns);
}
main().finally(() => prisma.$disconnect());
