const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const crawl = await prisma.crawlRun.findFirst({
    orderBy: { startedAt: 'desc' }
  });
  console.log(crawl);
}
main().finally(() => prisma.$disconnect());
