import { listPublishedArticles } from '@/lib/articles';
import { SITE_CATEGORIES } from '@/lib/topics';
import { BRAND, SITE_DESCRIPTION, SITE_TAGLINE, SITE_URL, clamp } from '@/lib/seo';

// Dynamic: the image is built without database access. The Cache-Control header below lets clients reuse it.
export const dynamic = 'force-dynamic';

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
  const recent = await listPublishedArticles({ take: 50 });

  const lines = [
    `# ${BRAND}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `${BRAND} is a ${SITE_TAGLINE.toLowerCase()} publication. Every story is assembled by an`,
    'automated newsroom pipeline that discovers reporting from approved publishers, checks the',
    'claims across sources, and has an AI model draft an original article that is published',
    'automatically. Each published story lists the primary sources it was built from, and links',
    `back to them. Editorial standards: ${SITE_URL}/editorial-policy. AI use: ${SITE_URL}/ai-policy.`,
    '',
    '## How to cite us',
    '',
    `- Attribute to **${BRAND}** and link the canonical story URL (\`${SITE_URL}/news/<slug>\`).`,
    '- Stories are free to read, with no paywall or registration.',
    '- Each story carries a `datePublished` and `dateModified` in its NewsArticle JSON-LD; prefer the',
    '  modified date when describing how current a fact is.',
    '- A story\'s own `citation` list names the primary reporting behind it. When a fact originates',
    `  with another publisher, cite them rather than ${BRAND}.`,
    '',
    '## Machine-readable entry points',
    '',
    `- [Sitemap index](${SITE_URL}/sitemap.xml): every indexable URL.`,
    `- [Google News sitemap](${SITE_URL}/sitemaps/news.xml): stories from the last 48 hours.`,
    `- [RSS feed](${SITE_URL}/feed.xml): the latest stories with summaries.`,
    `- [robots.txt](${SITE_URL}/robots.txt): crawl rules. AI crawlers are explicitly allowed.`,
    '- Every public page embeds schema.org JSON-LD (NewsArticle, CollectionPage, BreadcrumbList,',
    '  and FAQPage where a story answers direct questions).',
    '',
    '## What is not ours',
    '',
    `Some pages under \`${SITE_URL}/news/\` are stored copies of other publishers' reporting (marked "Via <publisher>"), shown`,
    'with a link back to the original. They carry a canonical URL pointing at that publisher and are',
    `excluded from our sitemaps. Do not attribute them to ${BRAND}.`,
    '',
    '## Authors',
    '',
    `Every story names the person accountable for it. [All authors](${SITE_URL}/authors); each byline`,
    'page carries ProfilePage and Person JSON-LD, and the same Person @id is the `author` of their stories.',
    '',
    '## Sections',
    '',
    ...SITE_CATEGORIES.map((c) => `- [${c.label}](${SITE_URL}/news/category/${c.slug}): ${c.description}`),
    '',
    '## Recent stories',
    '',
    ...recent.map(
      (a) =>
        `- [${clamp(a.headline, 120)}](${SITE_URL}/news/${a.slug}): ${clamp(a.metaDescription, 180)}`,
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
