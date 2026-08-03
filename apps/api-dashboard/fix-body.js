const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const article = await prisma.originalContent.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (article && !article.bodyHtml.includes('\n\n')) {
     const fixedBody = article.bodyHtml
        .replace(/## /g, '\n\n## ')
        .replace(/### /g, '\n\n### ')
        .replace(/# /g, '\n\n# ')
        .replace(/<div/g, '\n\n<div')
        .replace(/<\/div>/g, '</div>\n\n')
        .replace(/\*\*!\[/g, '\n\n**![');
        
     await prisma.originalContent.update({
        where: { id: article.id },
        data: { bodyHtml: fixedBody }
     });
     console.log('Fixed the article body for testing.');
  }
}
main().finally(() => prisma.$disconnect());
