const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.crawlRun.updateMany({
    where: {
      status: 'running'
    },
    data: {
      status: 'failed',
      errorCount: 1
    }
  });
  console.log(`Updated ${result.count} stuck runs to failed.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
