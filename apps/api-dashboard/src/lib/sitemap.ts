import 'server-only';
import { prisma } from '@/lib/prisma';
import { BRAND, SITE_URL, articlePath } from '@/lib/articles';
import { authorPath } from '@/lib/authors';
import { SITE_LANG, xmlEscape } from '@/lib/seo';
import { SITE_CATEGORIES, categoryForArticle, type CategorySlug } from '@/lib/topics';
import { MIN_COMPANY_STORIES } from '@/lib/companies';
import { companyIndex } from '@/lib/company-index';
import { coverPath } from '@/lib/covers';
import { stampSitemapGenerated } from '@/lib/health';
import { recordSiteError } from '@/lib/site-errors';

/**
 * The sitemap set, one file per kind of page so Search Console reports
 * coverage for each separately:
 *
 *   /sitemap.xml                          index of the files below
 *   /sitemaps/pages.xml                   home and trust pages
 *   /sitemaps/categories.xml              the six section pages
 *   /sitemaps/authors.xml                 /authors and each author with a story
 *   /sitemaps/news.xml                    Google News: stories from the last 48 hours
 *   /sitemaps/articles-<category>-N.xml   published stories in one section, ARTICLES_PER_FILE per file
 *   /sitemaps/companies-N.xml             company hubs with enough coverage to index
 *
 * Every story is filed under exactly one section (categoryForArticle), so the
 * article files never overlap. Syndicated stories, search, admin and API routes
 * are never listed: they are noindex or not pages at all.
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

/** Headline per published version (Google News needs it). */
async function headlinesByVersion(versionIds: string[]): Promise<Map<string, string>> {
  if (versionIds.length === 0) return new Map();
  const versions = await prisma.articleVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, headline: true } });
  return new Map(versions.map((v) => [v.id, v.headline]));
}

/** Every story's image is our own cover card, never the publisher's photo. */
function coverUrl(slug: string): string {
  return `${SITE_URL}${coverPath(slug)}`;
}

async function newestPublished(): Promise<Date | null> {
  const a = await prisma.article.findFirst({ where: PUBLIC_WHERE, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
  return a?.updatedAt ?? null;
}

export async function pageEntries(): Promise<UrlEntry[]> {
  const newest = await newestPublished();
  return STATIC_PATHS.map((p) => ({ loc: `${SITE_URL}${p}`, lastmod: p === '/' ? newest : undefined }));
}

/**
 * Author pages with at least one published story, and the
 * /authors hub that links them.
 */
export async function authorEntries(): Promise<UrlEntry[]> {
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

/** Published stories per site section: the raw labels that fold into it, how many, and the newest change. */
export interface SectionBucket {
  slug: CategorySlug;
  labels: string[];
  /** Stories with no category at all file under Technology (categoryForArticle). */
  includesNull: boolean;
  count: number;
  lastmod: Date | null;
}

/** Folds per-label counts into the six sections. Pure, so the bucketing is testable. */
export function bucketByCategory(rows: { category: string | null; count: number; lastmod: Date | null }[]): SectionBucket[] {
  const buckets = new Map<CategorySlug, SectionBucket>(
    SITE_CATEGORIES.map((c) => [c.slug, { slug: c.slug, labels: [], includesNull: false, count: 0, lastmod: null }]),
  );
  for (const row of rows) {
    const b = buckets.get(categoryForArticle(row.category).slug)!;
    if (row.category === null) b.includesNull = true;
    else b.labels.push(row.category);
    b.count += row.count;
    if (row.lastmod && (!b.lastmod || row.lastmod > b.lastmod)) b.lastmod = row.lastmod;
  }
  return [...buckets.values()];
}

export async function sectionBuckets(): Promise<SectionBucket[]> {
  const rows = await prisma.article.groupBy({ by: ['category'], where: PUBLIC_WHERE, _count: { _all: true }, _max: { updatedAt: true } });
  return bucketByCategory(rows.map((r) => ({ category: r.category, count: r._count._all, lastmod: r._max.updatedAt })));
}

export async function categoryEntries(): Promise<UrlEntry[]> {
  // Only sections that have something in them.
  return (await sectionBuckets())
    .filter((b) => b.count > 0)
    .map((b) => ({ loc: `${SITE_URL}/news/category/${b.slug}`, lastmod: b.lastmod }));
}

export function articleFileName(slug: CategorySlug, page: number): string {
  return `articles-${slug}-${page}.xml`;
}

export async function articleEntries(bucket: SectionBucket, page: number): Promise<UrlEntry[]> {
  const inSection = [
    ...(bucket.labels.length ? [{ category: { in: bucket.labels } }] : []),
    ...(bucket.includesNull ? [{ category: null }] : []),
  ];
  if (inSection.length === 0) return [];
  const rows = await prisma.article.findMany({
    where: { ...PUBLIC_WHERE, OR: inSection },
    select: { slug: true, updatedAt: true, publishedAt: true },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * ARTICLES_PER_FILE,
    take: ARTICLES_PER_FILE,
  });
  return rows.map((r) => ({
    loc: `${SITE_URL}${articlePath(r.slug)}`,
    lastmod: r.updatedAt ?? r.publishedAt,
    images: [coverUrl(r.slug)],
  }));
}

export async function newsEntries(now = Date.now()): Promise<UrlEntry[]> {
  const rows = await prisma.article.findMany({
    where: { ...PUBLIC_WHERE, publishedAt: { gte: new Date(now - NEWS_WINDOW_MS) } },
    select: { slug: true, publishedAt: true, publishedVersionId: true },
    orderBy: { publishedAt: 'desc' },
    take: NEWS_MAX,
  });
  const headlines = await headlinesByVersion(rows.map((r) => r.publishedVersionId).filter((x): x is string => Boolean(x)));
  const out: UrlEntry[] = [];
  for (const r of rows) {
    const headline = r.publishedVersionId ? headlines.get(r.publishedVersionId) : undefined;
    if (!headline || !r.publishedAt) continue;
    out.push({
      loc: `${SITE_URL}${articlePath(r.slug)}`,
      news: { title: headline, publishedAt: r.publishedAt },
      images: [coverUrl(r.slug)],
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
  const [buckets, companyFiles, newest, authors] = await Promise.all([sectionBuckets(), companyFileCount(), newestPublished(), authorEntries()]);
  const file = (name: string) => `${SITE_URL}/sitemaps/${name}`;
  const withStories = buckets.filter((b) => b.count > 0);
  return [
    { loc: file('pages.xml'), lastmod: newest },
    ...(withStories.length ? [{ loc: file('categories.xml'), lastmod: newest }] : []),
    ...(authors.length ? [{ loc: file('authors.xml'), lastmod: authors[0].lastmod }] : []),
    { loc: file('news.xml'), lastmod: newest },
    ...withStories.flatMap((b) =>
      Array.from({ length: Math.ceil(b.count / ARTICLES_PER_FILE) }, (_, i) => ({
        loc: file(articleFileName(b.slug, i + 1)),
        // Files are newest-first, so only the first page moves with each publish.
        lastmod: i === 0 ? b.lastmod : undefined,
      })),
    ),
    ...Array.from({ length: companyFiles }, (_, i) => ({ loc: file(`companies-${i + 1}.xml`) })),
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
