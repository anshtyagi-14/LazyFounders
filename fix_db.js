const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.crawlRun.updateMany({
    where: { status: 'running' },
    data: { status: 'failed', errorCount: 1 }
  });
  console.log('Fixed stuck crawl runs');
}
main().finally(() => prisma.$disconnect());
