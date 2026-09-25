/**
 * Read-only report of reader-facing content that is not in the publish language:
 * published articles (including legacy backfills) and visible wire items.
 * Changes nothing; review the list before archiving anything.
 *
 *   npm run content:language-audit
 */
import { PrismaClient } from '@lazyfounders/database';
import { readerText } from '../stages/validate-publish';
import { loadPipelineConfig } from '../stages';
import { checkOutputLanguage } from '../validate/checks';
import { loadEnv } from './common';

async function main() {
  loadEnv();
  const { publishLanguage } = loadPipelineConfig();
  const prisma = new PrismaClient();
  try {
    const articles = await prisma.article.findMany({
      where: { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } },
      select: { id: true, slug: true, publishedVersionId: true, legacyContentId: true },
    });
    let flagged = 0;
    for (const a of articles) {
      const v = await prisma.articleVersion.findUnique({
        where: { id: a.publishedVersionId! },
        select: { headline: true, intro: true, bodyMarkdown: true },
      });
      if (!v) continue;
      const issues = checkOutputLanguage(readerText(v), publishLanguage);
      if (!issues.length) continue;
      flagged++;
      console.log(`article\t${a.slug}\t${a.legacyContentId ? 'legacy' : 'v2'}\t${issues.map((i) => i.message).join('; ')}`);
    }

    const wire = await prisma.sourceArticle.groupBy({
      by: ['language'],
      where: { headline: { not: null }, paywalled: false, state: { notIn: ['ARCHIVED', 'REJECTED'] }, source: { trustStatus: 'APPROVED', enabled: true } },
      _count: true,
    });
    console.log(`\n${flagged} of ${articles.length} published articles are not in "${publishLanguage}".`);
    console.log('Visible wire items by detected language (the site now shows only "en"):');
    for (const w of wire) console.log(`  ${w.language ?? 'unknown'}\t${w._count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
