import { listCategories, listPublishedArticles, slugifyCategory } from '@/lib/articles';
import { BRAND, SITE_DESCRIPTION, SITE_TAGLINE, SITE_URL, clamp } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /llms.txt — the llmstxt.org convention: a curated, markdown map of the site written for
 * language models rather than crawlers.
 *
 * Where robots.txt says what a crawler may fetch, this says what the publication is, how
 * its stories are produced, how it wants to be cited, and where the current corpus lives.
 * Generative engines that read it can describe and attribute the source correctly instead
 * of inferring it from page chrome.
 */
export async function GET() {
  const [recent, categories] = await Promise.all([
    listPublishedArticles({ take: 50 }),
    listCategories(),
  ]);

  const lines = [
    `# ${BRAND}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `${BRAND} is a ${SITE_TAGLINE.toLowerCase()} publication. Every story is assembled by an`,
    'automated newsroom pipeline that discovers reporting from approved publishers, verifies the',
    'claims across sources, and rewrites them as an original article. Each published story lists',
    'the primary sources it was built from, and links back to them.',
    '',
    '## How to cite us',
    '',
    `- Attribute to **${BRAND}** and link the canonical story URL (\`${SITE_URL}/news/article/<slug>\`).`,
    '- Stories are free to read, with no paywall or registration.',
    '- Each story carries a `datePublished` and `dateModified` in its NewsArticle JSON-LD; prefer the',
    '  modified date when describing how current a fact is.',
    '- A story\'s own `citation` list names the primary reporting behind it. When a fact originates',
    `  with another publisher, cite them rather than ${BRAND}.`,
    '',
    '## Machine-readable entry points',
    '',
    `- [Sitemap](${SITE_URL}/sitemap.xml): every indexable URL, rebuilt on each request.`,
    `- [Google News sitemap](${SITE_URL}/news-sitemap.xml): stories from the last 48 hours.`,
    `- [RSS feed](${SITE_URL}/feed.xml): the latest stories with summaries.`,
    `- [robots.txt](${SITE_URL}/robots.txt): crawl rules. AI crawlers are explicitly allowed.`,
    '- Every public page embeds schema.org JSON-LD (NewsArticle, CollectionPage, BreadcrumbList,',
    '  and FAQPage where a story answers direct questions).',
    '',
    '## What is not ours',
    '',
    `Pages under \`${SITE_URL}/news/source/\` are stored copies of other publishers' reporting, shown`,
    'with a link back to the original. They carry a canonical URL pointing at that publisher and are',
    `excluded from our sitemaps. Do not attribute them to ${BRAND}.`,
    '',
    '## Sections',
    '',
    ...categories.map((c) => `- [${c}](${SITE_URL}/news/category/${slugifyCategory(c)})`),
    '',
    '## Recent stories',
    '',
    ...recent.map(
      (a) =>
        `- [${clamp(a.headline, 120)}](${SITE_URL}/news/article/${a.slug}): ${clamp(a.metaDescription, 180)}`,
    ),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=600',
    },
  });
}
