import { listPublishedArticles } from '@/lib/articles';
import { BRAND, SITE_DESCRIPTION, SITE_LANG, SITE_LOGO, SITE_URL, stripMarkdown, clamp, xmlEscape } from '@/lib/seo';
import { coverPath } from '@/lib/covers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * RSS 2.0 feed. Feed readers, news aggregators and several AI crawlers discover new
 * stories here long before a sitemap recrawl, so it is linked from <head> on every page.
 */
const TAKE = 50;

export async function GET() {
  const articles = await listPublishedArticles({ take: TAKE });
  const updated = articles[0]?.updatedAt ?? new Date();

  const items = articles
    .map((a) => {
      const url = `${SITE_URL}/news/${a.slug}`;
      const summary = a.metaDescription || clamp(stripMarkdown(a.intro), 300);
      const image = `${SITE_URL}${coverPath(a.slug)}`;
      return [
        '    <item>',
        `      <title>${xmlEscape(a.headline)}</title>`,
        `      <link>${xmlEscape(url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        `      <pubDate>${a.publishedAt.toUTCString()}</pubDate>`,
        `      <category>${xmlEscape(a.category)}</category>`,
        `      <description>${xmlEscape(summary)}</description>`,
        `      <enclosure url="${xmlEscape(image)}" type="image/png" length="0" />`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(BRAND)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>${xmlEscape(SITE_LANG)}</language>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <image>
      <url>${xmlEscape(SITE_LOGO)}</url>
      <title>${xmlEscape(BRAND)}</title>
      <link>${xmlEscape(SITE_URL)}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
