import 'server-only';
import { prisma } from '@/lib/prisma';
import { BRAND, SITE_URL } from '@/lib/articles';
import { authorPath } from '@/lib/authors';
import { SITE_LANG, xmlEscape } from '@/lib/seo';
import { SITE_CATEGORIES } from '@/lib/topics';
import { MIN_COMPANY_STORIES } from '@/lib/companies';
import { companyIndex } from '@/lib/company-index';
import { usableImageUrl } from '@/lib/images';
import { stampSitemapGenerated } from '@/lib/health';
import { recordSiteError } from '@/lib/site-errors';

/**
 * The sitemap set:
 *
 *   /sitemap.xml                 index of the files below
 *   /sitemaps/static.xml         home, trust pages, /authors and author pages
 *   /sitemaps/news.xml           Google News: stories from the last 48 hours
 *   /sitemaps/articles-N.xml     every published story, ARTICLES_PER_FILE per file
 *   /sitemaps/companies-N.xml    company hubs with enough coverage to index
 *   /sitemaps/categories.xml     the six sections
 *
 * Source-story pages (/news/source/*), search, admin and API routes are never
 * listed: they are noindex or not pages at all.
 */

export const ARTICLES_PER_FILE = 10_000;
export const COMPANIES_PER_FILE = 10_000;
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;
const NEWS_MAX = 1000;

const PUBLIC_WHERE = { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } };

export const STATIC_PATHS = ['/', '/about', '/contact', '/editorial-policy', '/ai-policy', '/corrections', '/disclaimer', '/terms'];

export interface UrlEntry {
  loc: string;
  lastmod?: Date | null;
  images?: string[];
  news?: { title: string; publishedAt: Date };
}

export function urlsetXml(entries: UrlEntry[]): string {
  const body = entries
    .map((e) => {
      const lines = ['  <url>', `    <loc>${xmlEscape(e.loc)}</loc>`];
      if (e.lastmod) lines.push(`    <lastmod>${e.lastmod.toISOString()}</lastmod>`);
      if (e.news) {
        lines.push(
          '    <news:news>',
          '      <news:publication>',
          `        <news:name>${xmlEscape(BRAND)}</news:name>`,
          `        <news:language>${xmlEscape(SITE_LANG)}</news:language>`,
          '      </news:publication>',
          `      <news:publication_date>${e.news.publishedAt.toISOString()}</news:publication_date>`,
          `      <news:title>${xmlEscape(e.news.title)}</news:title>`,
          '    </news:news>',
        );
      }
      for (const img of e.images ?? []) lines.push(`    <image:image><image:loc>${xmlEscape(img)}</image:loc></image:image>`);
      lines.push('  </url>');
      return lines.join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`;
}

export function sitemapIndexXml(files: { loc: string; lastmod?: Date | null }[]): string {
  const body = files
    .map((f) =>
      ['  <sitemap>', `    <loc>${xmlEscape(f.loc)}</loc>`, ...(f.lastmod ? [`    <lastmod>${f.lastmod.toISOString()}</lastmod>`] : []), '  </sitemap>'].join('\n'),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

// --- data --------------------------------------------------------------------

/** Lead image per published version, only when it is a URL we would actually show. */
async function imagesByVersion(versionIds: string[]): Promise<Map<string, { url: string; headline: string }>> {
  if (versionIds.length === 0) return new Map();
  const versions = await prisma.articleVersion.findMany({
    where: { id: { in: versionIds } },
    select: { id: true, featuredImage: true, headline: true },
  });
  return new Map(
    versions.map((v) => {
      const url = usableImageUrl((v.featuredImage as { url?: string } | null)?.url);
      return [v.id, { url: url && /^https:/.test(url) ? url : '', headline: v.headline }];
    }),
  );
}

async function newestPublished(): Promise<Date | null> {
  const a = await prisma.article.findFirst({ where: PUBLIC_WHERE, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
  return a?.updatedAt ?? null;
}

export async function staticEntries(): Promise<UrlEntry[]> {
  const [newest, authors] = await Promise.all([newestPublished(), authorEntries()]);
  return [...STATIC_PATHS.map((p) => ({ loc: `${SITE_URL}${p === '/' ? '/' : p}`, lastmod: p === '/' ? newest : undefined })), ...authors];
}

/**
 * Author pages with at least one published story, and the
 * /authors hub that links them.
 */
async function authorEntries(): Promise<UrlEntry[]> {
  const rows = await prisma.article.groupBy({ by: ['authorId'], where: { ...PUBLIC_WHERE, authorId: { not: null } }, _max: { publishedAt: true } });
  if (rows.length === 0) return [];
  const authors = await prisma.author.findMany({ where: { id: { in: rows.map((r) => r.authorId!) } }, select: { id: true, slug: true, updatedAt: true } });
  const lastmod = new Map(rows.map((r) => [r.authorId, r._max.publishedAt]));
  const hubLastmod = authors.reduce<Date | null>((max, a) => (!max || a.updatedAt > max ? a.updatedAt : max), null);
  return [
    { loc: `${SITE_URL}/authors`, lastmod: hubLastmod },
    ...authors.map((a) => ({ loc: `${SITE_URL}${authorPath(a.slug)}`, lastmod: lastmod.get(a.id) ?? undefined })),
  ];
}

export async function categoryEntries(): Promise<UrlEntry[]> {
  // Only sections that have something in them.
  const { listCategoryFeed } = await import('@/lib/feed');
  const out: UrlEntry[] = [];
  for (const c of SITE_CATEGORIES) {
    const { items, total } = await listCategoryFeed(c.slug, { perPage: 1 });
    if (total > 0) out.push({ loc: `${SITE_URL}/news/category/${c.slug}`, lastmod: items[0]?.publishedAt });
  }
  return out;
}

export async function articleFileCount(): Promise<number> {
  const n = await prisma.article.count({ where: PUBLIC_WHERE });
  return Math.max(1, Math.ceil(n / ARTICLES_PER_FILE));
}

export async function articleEntries(page: number): Promise<UrlEntry[]> {
  const rows = await prisma.article.findMany({
    where: PUBLIC_WHERE,
    select: { slug: true, updatedAt: true, publishedAt: true, publishedVersionId: true },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * ARTICLES_PER_FILE,
    take: ARTICLES_PER_FILE,
  });
  const images = await imagesByVersion(rows.map((r) => r.publishedVersionId).filter((x): x is string => Boolean(x)));
  return rows.map((r) => {
    const img = r.publishedVersionId ? images.get(r.publishedVersionId)?.url : '';
    return {
      loc: `${SITE_URL}/news/article/${r.slug}`,
      lastmod: r.updatedAt ?? r.publishedAt,
      images: img ? [img] : undefined,
    };
  });
}

export async function newsEntries(now = Date.now()): Promise<UrlEntry[]> {
  const rows = await prisma.article.findMany({
    where: { ...PUBLIC_WHERE, publishedAt: { gte: new Date(now - NEWS_WINDOW_MS) } },
    select: { slug: true, publishedAt: true, publishedVersionId: true },
    orderBy: { publishedAt: 'desc' },
    take: NEWS_MAX,
  });
  const versions = await imagesByVersion(rows.map((r) => r.publishedVersionId).filter((x): x is string => Boolean(x)));
  const out: UrlEntry[] = [];
  for (const r of rows) {
    const v = r.publishedVersionId ? versions.get(r.publishedVersionId) : undefined;
    if (!v?.headline || !r.publishedAt) continue;
    out.push({
      loc: `${SITE_URL}/news/article/${r.slug}`,
      news: { title: v.headline, publishedAt: r.publishedAt },
      images: v.url ? [v.url] : undefined,
    });
  }
  return out;
}

async function indexableCompanies() {
  const index = await companyIndex();
  return [...index.values()]
    .filter((c) => c.storyCount >= MIN_COMPANY_STORIES)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function companyFileCount(): Promise<number> {
  return Math.max(1, Math.ceil((await indexableCompanies()).length / COMPANIES_PER_FILE));
}

export async function companyEntries(page: number): Promise<UrlEntry[]> {
  const all = await indexableCompanies();
  return all
    .slice((page - 1) * COMPANIES_PER_FILE, page * COMPANIES_PER_FILE)
    .map((c) => ({ loc: `${SITE_URL}/company/${c.slug}`, lastmod: c.lastModified }));
}

export async function sitemapIndexFiles(): Promise<{ loc: string; lastmod?: Date | null }[]> {
  const [articleFiles, companyFiles, newest] = await Promise.all([articleFileCount(), companyFileCount(), newestPublished()]);
  return [
    { loc: `${SITE_URL}/sitemaps/static.xml` },
    { loc: `${SITE_URL}/sitemaps/news.xml`, lastmod: newest },
    ...Array.from({ length: articleFiles }, (_, i) => ({ loc: `${SITE_URL}/sitemaps/articles-${i + 1}.xml`, lastmod: i === 0 ? newest : undefined })),
    ...Array.from({ length: companyFiles }, (_, i) => ({ loc: `${SITE_URL}/sitemaps/companies-${i + 1}.xml` })),
    { loc: `${SITE_URL}/sitemaps/categories.xml`, lastmod: newest },
  ];
}

// --- serving -------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { xml: string; expires: number }>();

/**
 * Build (or reuse) one sitemap document. Crawlers fetch these far more often than
 * the story set changes, so each file is held in process memory for a few
 * minutes. A failure is logged for the admin and answered with a 503, which
 * tells crawlers to retry rather than drop the URLs.
 */
export async function serveSitemap(key: string, build: () => Promise<string | null>): Promise<Response> {
  const hit = cache.get(key);
  let xml = hit && hit.expires > Date.now() ? hit.xml : null;
  if (!xml) {
    try {
      const built = await build();
      if (built === null) return new Response('Not found', { status: 404 });
      xml = built;
      cache.set(key, { xml, expires: Date.now() + CACHE_TTL_MS });
      await stampSitemapGenerated();
    } catch (err) {
      await recordSiteError('sitemap', `/sitemaps/${key}`, err instanceof Error ? err.message : String(err));
      return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '300' } });
    }
  }
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
