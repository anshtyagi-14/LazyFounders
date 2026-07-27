const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const scrapedCount = await prisma.scrapeResult.count();
  const catCount = await prisma.categorizationResult.count();
  const intelCount = await prisma.intelligenceResult.count();
  const originalCount = await prisma.originalContent.count();
  
  console.log(`Scraped: ${scrapedCount}`);
  console.log(`Categorized: ${catCount}`);
  console.log(`Intelligence (Deduplicated): ${intelCount}`);
  console.log(`Original Content (LLM Rewritten): ${originalCount}`);
  
  // Show the latest Original Content
  const latestOriginal = await prisma.originalContent.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (latestOriginal) {
    console.log("Latest LLM Output SEO Title:", latestOriginal.seoTitle);
  } else {
    console.log("No Original Content generated yet!");
    
    // Check if there are any errors in the intelligence service logs
  }
}
main().finally(() => prisma.$disconnect());
