const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const crawlRun = await prisma.crawlRun.findFirst({
    orderBy: { startedAt: 'desc' },
    include: { source: true }
  });
  console.log(`Latest Crawl Run Source: ${crawlRun.source.domain}`);
  console.log(`Total URLs: ${crawlRun.totalUrls}, New URLs: ${crawlRun.newUrls}`);
  
  // Check if any url_states from this run have lastmod dates
  const urlStates = await prisma.urlState.findMany({
    where: { sourceId: crawlRun.sourceId, changeType: 'NEW' },
    take: 10,
    select: { url: true, lastmod: true }
  });
  
  console.log("Sample URL States with lastmod:");
  console.log(urlStates);
}
main().finally(() => prisma.$disconnect());
