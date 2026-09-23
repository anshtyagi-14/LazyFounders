import { prisma } from '@/lib/prisma';
import { SITE_LANG } from '@/lib/seo';
import { BRAND, SITE_URL } from '@/lib/articles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Google News sitemap. It is a separate document from /sitemap.xml because Google News
 * requires the `news:` namespace and accepts only articles from the last 48 hours, capped
 * at 1,000 URLs. Next's MetadataRoute.Sitemap cannot express that namespace, so the XML
 * is built by hand here.
 */
const WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_URLS = 1000;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const since = new Date(Date.now() - WINDOW_MS);
  const articles = await prisma.article.findMany({
    where: {
      publishedVersionId: { not: null },
      status: { notIn: ['ARCHIVED', 'REJECTED'] },
      publishedAt: { gte: since },
    },
    select: { slug: true, publishedAt: true, publishedVersionId: true },
    orderBy: { publishedAt: 'desc' },
    take: MAX_URLS,
  });

  const ids = articles.map((a) => a.publishedVersionId).filter((x): x is string => Boolean(x));
  const versions = ids.length
    ? await prisma.articleVersion.findMany({ where: { id: { in: ids } }, select: { id: true, headline: true } })
    : [];
  const headlineById = new Map(versions.map((v) => [v.id, v.headline]));

  const entries = articles
    .map((a) => {
      const headline = a.publishedVersionId ? headlineById.get(a.publishedVersionId) : undefined;
      if (!headline || !a.publishedAt) return '';
      return [
        '  <url>',
        `    <loc>${xmlEscape(`${SITE_URL}/news/article/${a.slug}`)}</loc>`,
        '    <news:news>',
        '      <news:publication>',
        `        <news:name>${xmlEscape(BRAND)}</news:name>`,
        `        <news:language>${xmlEscape(SITE_LANG)}</news:language>`,
        '      </news:publication>',
        `      <news:publication_date>${a.publishedAt.toISOString()}</news:publication_date>`,
        `      <news:title>${xmlEscape(headline)}</news:title>`,
        '    </news:news>',
        '  </url>',
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
