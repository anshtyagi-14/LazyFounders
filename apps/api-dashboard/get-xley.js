const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const article = await prisma.originalContent.findFirst({
    where: { slug: { contains: 'xley-revolutionizing' } }
  });
  console.log('--- RAW DB CONTENT ---');
  console.log(JSON.stringify(article.bodyHtml));
  console.log('--- END RAW DB CONTENT ---');
}
main().finally(() => prisma.$disconnect());
