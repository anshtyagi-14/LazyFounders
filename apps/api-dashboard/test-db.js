const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const article = await prisma.originalContent.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log('--- START BODY ---');
  console.log(article.bodyHtml);
  console.log('--- END BODY ---');
}
main().finally(() => prisma.$disconnect());
