const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const articles = await prisma.originalContent.findMany({
    select: { keywords: true },
    take: 5
  });
  console.log("OriginalContent keywords:", JSON.stringify(articles, null, 2));

  const cats = await prisma.categorizationResult.findMany({
    select: { entities: true, tags: true },
    take: 5
  });
  console.log("CategorizationResult entities:", JSON.stringify(cats, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
