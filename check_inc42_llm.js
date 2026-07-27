const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const intelCount = await prisma.intelligenceResult.count({
    where: { categorization: { scrapeResult: { urlState: { source: { domain: 'inc42.com' } } } } }
  });
  const originalCount = await prisma.originalContent.count({
    where: { intelligenceResult: { categorization: { scrapeResult: { urlState: { source: { domain: 'inc42.com' } } } } } }
  });
  console.log("Inc42 Intelligence:", intelCount);
  console.log("Inc42 LLM Rewritten:", originalCount);
}
main().finally(() => prisma.$disconnect());
