import { prisma } from '@/lib/prisma';
import { cleanAuthor, scrubForeignContacts, slugify } from '@lazyfounders/ingestion-core/editorial';
import { authorInitials, authorPath, loadAuthors, type PublicAuthor } from '@/lib/authors';
import type { ArticleProps } from '../components/FeaturedCard';

/**
 * Public read model. Only versions that an editor (or the auto-publish policy) published
 * are ever shown: an article is public iff publishedVersionId is set and it is not
 * archived/rejected. Newer drafts of a published article stay invisible until published.
 */
const PUBLIC_WHERE = { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } };

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const BRAND = process.env.SITE_BRAND_NAME || 'LazyFounders';
/** Lightweight brand card (1200x630 WebP) for cards and heroes with no usable image. */
export const FALLBACK_IMAGE_PATH = '/fallback.webp';

export interface FeaturedImage {
  url: string;
  credit?: string | null;
  publisher?: string | null;
  sourceUrl?: string | null;
}

export interface PublicCitation {
  position: number;
  publisher: string;
  url: string;
  title: string | null;
  language: string | null;
  publishedAt: Date | null;
}

export interface PublicArticle {
  id: string;
  slug: string;
  category: string;
  tags: string[];
  companies: string[];
  publishedAt: Date;
  updatedAt: Date;
  headline: string;
  seoTitle: string;
  metaDescription: string;
  intro: string;
  bodyMarkdown: string;
  featuredImage: FeaturedImage | null;
  /**
   * Second step of the image chain: another cited source's lead image, used
   * when the story has none of its own. Only loaded for the article page.
   */
  sourceImage?: FeaturedImage | null;
  citations: PublicCitation[];
  readTime: number;
  isLegacy: boolean;
  /** Byline; null only when no author row exists at all (the brand is shown). */
  author: PublicAuthor | null;
}

export function slugifyCategory(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function readTime(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function sanitizeHeadline(value: string | null | undefined): string {
  if (!value) return '';

  let decoded = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

  for (let i = 0; i < 2; i += 1) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&amp;/gi, '&');
    if (next === decoded) break;
    decoded = next;
  }

  return decoded.replace(/\s+/g, ' ').trim();
}

type ArticleRow = Awaited<ReturnType<typeof prisma.article.findMany>>[number];

async function withVersions(rows: ArticleRow[]) {
  const ids = rows.map((r) => r.publishedVersionId).filter((x): x is string => Boolean(x));
  const versions = ids.length
    ? await prisma.articleVersion.findMany({ where: { id: { in: ids } }, include: { citations: { orderBy: { position: 'asc' } } } })
    : [];
  const byId = new Map(versions.map((v) => [v.id, v]));
  const authorOf = await loadAuthors(rows.map((r) => r.authorId));
  return rows
    .map((a) => ({ a, v: a.publishedVersionId ? byId.get(a.publishedVersionId) : undefined, author: authorOf(a.authorId) }))
    .filter((x): x is { a: ArticleRow; v: NonNullable<typeof x.v>; author: PublicAuthor | null } => Boolean(x.v));
}

function toPublic({ a, v, author }: Awaited<ReturnType<typeof withVersions>>[number]): PublicArticle {
  // Stories stored before the pipeline scrubbed third-party contacts (reporter
  // bios, press emails) are cleaned here, so no foreign address is ever served.
  const bodyMarkdown = scrubForeignContacts(v.bodyMarkdown).text;
  return {
    id: a.id,
    slug: a.slug,
    category: a.category || 'Technology',
    tags: a.tags,
    companies: a.companies,
    publishedAt: a.publishedAt ?? a.createdAt,
    updatedAt: v.createdAt,
    headline: sanitizeHeadline(v.headline),
    seoTitle: sanitizeHeadline(v.seoTitle),
    metaDescription: sanitizeHeadline(v.metaDescription),
    intro: sanitizeHeadline(scrubForeignContacts(v.intro).text),
    bodyMarkdown,
    featuredImage: (v.featuredImage as FeaturedImage | null) ?? null,
    citations: v.citations.map((c) => ({ position: c.position, publisher: c.publisher, url: c.url, title: c.title, language: c.language, publishedAt: c.publishedAt })),
    readTime: readTime(bodyMarkdown),
    isLegacy: Boolean(a.legacyContentId),
    author,
  };
}

export function toArticleProps(p: PublicArticle): ArticleProps {
  return {
    url: `/news/article/${p.slug}`,
    imageUrl: p.featuredImage?.url || FALLBACK_IMAGE_PATH,
    category: p.category,
    title: sanitizeHeadline(p.headline),
    description: sanitizeHeadline(p.metaDescription),
    authorInitials: p.author ? authorInitials(p.author.name) : BRAND.slice(0, 2).toUpperCase(),
    authorName: p.author?.name ?? BRAND,
    authorUrl: p.author ? authorPath(p.author.slug) : undefined,
    readTime: p.readTime,
    publishedDate: formatDate(p.publishedAt),
    id: p.id,
    origin: 'synthesis',
    publishedAt: p.publishedAt.toISOString(),
  };
}

export async function listPublishedArticles(
  opts: { take?: number; skip?: number; categories?: string[]; companies?: string[]; excludeId?: string; authorId?: string } = {},
): Promise<PublicArticle[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...PUBLIC_WHERE,
      // Raw Article.category values; translate a site category with labelsForCategory().
      ...(opts.categories ? { category: { in: opts.categories } } : {}),
      ...(opts.companies?.length ? { companies: { hasSome: opts.companies } } : {}),
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
      ...(opts.authorId ? { authorId: opts.authorId } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    skip: opts.skip,
    take: opts.take ?? 28,
  });
  return (await withVersions(rows)).map(toPublic);
}

export async function countPublishedArticles(opts: { categories?: string[]; authorId?: string } = {}): Promise<number> {
  return prisma.article.count({
    where: {
      ...PUBLIC_WHERE,
      ...(opts.categories ? { category: { in: opts.categories } } : {}),
      ...(opts.authorId ? { authorId: opts.authorId } : {}),
    },
  });
}

export interface Paged<T> {
  items: T[];
  /** Matches across the whole window, not just this page. */
  total: number;
}

export async function getPublishedArticle(slug: string): Promise<PublicArticle | null> {
  const a = await prisma.article.findFirst({ where: { slug, ...PUBLIC_WHERE } });
  if (!a) return null;
  const [row] = await withVersions([a]);
  if (!row) return null;
  const article = toPublic(row);
  if (!article.featuredImage?.url && a.storyId) article.sourceImage = await storySourceImage(a.storyId);
  return article;
}

/**
 * The first lead image among a story's sources whose image policy allows showing
 * it (the same rule the pipeline applies to the primary source).
 */
async function storySourceImage(storyId: string): Promise<FeaturedImage | null> {
  const rows = await prisma.storySource.findMany({
    where: { storyId, sourceArticle: { leadImage: { not: null }, source: { imagePolicy: { not: 'none' } } } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    take: 1,
    select: { sourceArticle: { select: { leadImage: true, imageCredit: true, publisher: true, canonicalUrl: true, finalUrl: true } } },
  });
  const s = rows[0]?.sourceArticle;
  if (!s?.leadImage) return null;
  return { url: s.leadImage, credit: s.imageCredit ?? s.publisher, publisher: s.publisher, sourceUrl: s.canonicalUrl ?? s.finalUrl };
}

/**
 * Stories straight from trusted sources, stored in the LazyFounders database and read on
 * /news/source/[slug] with a courtesy link back to the original publisher. Items that
 * already belong to a published LazyFounders story are left out so a story never shows twice.
 */
export interface SourceHeadline {
  id: string;
  /** Original publisher URL (shown in the courtesy section). */
  sourceUrl: string;
  headline: string;
  excerpt: string;
  imageUrl: string | null;
  publisher: string;
  publishedAt: Date;
  /** Raw publisher category labels. Normalise with normalizeTopics() before display. */
  categories?: string[];
  readTime: number;
}

export interface SourceStory extends SourceHeadline {
  subheadline: string | null;
  author: string | null;
  imageCredit: string | null;
  language: string | null;
  paragraphs: string[];
}

const HIDDEN_SOURCE_STATES = ['ARCHIVED', 'REJECTED'];

const SOURCE_VISIBLE_WHERE = {
  headline: { not: null },
  paywalled: false,
  state: { notIn: HIDDEN_SOURCE_STATES },
  source: { trustStatus: 'APPROVED', enabled: true },
  // Wire copies are shown as scraped, untranslated: only English ones reach readers.
  // Other languages appear once the pipeline turns them into a LazyFounders story.
  language: 'en',
};

/** Hex characters of the id carried in the slug; enough to find the row by primary key. */
const SOURCE_ID_PREFIX = 8;

/** "/news/source/<headline-slug>-<first 8 hex of the id>" */
export function sourceStoryPath(id: string, headline: string): string {
  // Whole words only, up to ~70 characters: a cut word reads as a typo in search results.
  let words = '';
  for (const w of slugify(sanitizeHeadline(headline)).split('-')) {
    if (words && words.length + w.length + 1 > 70) break;
    words = words ? `${words}-${w}` : w;
  }
  return `/news/source/${words}-${id.slice(0, SOURCE_ID_PREFIX).toLowerCase()}`;
}

function httpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function excerptOf(text: string | null | undefined, max = 220): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).replace(/[\s,.;:]+$/, '')}…`;
}

/** Visible source stories that did not already become one of our published stories. */
function sourceListWhere(categories?: string[]) {
  return {
    ...SOURCE_VISIBLE_WHERE,
    ...(categories ? { categories: { hasSome: categories } } : {}),
    NOT: { storySource: { is: { story: { is: { article: { is: { publishedVersionId: { not: null } } } } } } } },
  };
}

export async function countSourceHeadlines(opts: { categories?: string[] } = {}): Promise<number> {
  return prisma.sourceArticle.count({ where: sourceListWhere(opts.categories) });
}

export async function listSourceHeadlines(opts: { take?: number; categories?: string[] } = {}): Promise<SourceHeadline[]> {
  const take = opts.take ?? 24;
  const rows = await prisma.sourceArticle.findMany({
    where: sourceListWhere(opts.categories),
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { fetchedAt: 'desc' }],
    take: take * 3,
    select: {
      id: true, canonicalFingerprint: true, headline: true, subheadline: true, bodyText: true,
      leadImage: true, publisher: true, publishedAt: true, fetchedAt: true,
      canonicalUrl: true, finalUrl: true, originalUrl: true, categories: true, tags: true,
      source: { select: { imagePolicy: true } },
    },
  });
  const seen = new Set<string>();
  const out: SourceHeadline[] = [];
  for (const r of rows) {
    const url = httpUrl(r.canonicalUrl) ?? httpUrl(r.finalUrl) ?? httpUrl(r.originalUrl);
    if (!url || !r.headline || seen.has(r.canonicalFingerprint)) continue;
    seen.add(r.canonicalFingerprint);
    out.push({
      id: r.id,
      sourceUrl: url,
      headline: sanitizeHeadline(r.headline),
      excerpt: excerptOf(sanitizeHeadline(r.subheadline || r.bodyText)),
      // A source that has not licensed its images for display gets the brand card.
      imageUrl: r.source.imagePolicy === 'none' ? null : httpUrl(r.leadImage),
      publisher: r.publisher,
      publishedAt: r.publishedAt ?? r.fetchedAt,
      // Categories only: tags are entities ("Meta", "OpenAI", "TechCrunch Disrupt"),
      // not subjects, and folding them in turns company names into topic sections.
      categories: r.categories ?? [],
      readTime: readTime(r.bodyText ?? ''),
    });
    if (out.length >= take) break;
  }
  return out;
}

function toParagraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_SLUG_RE = /^(?:.*-)?([0-9a-f]{8})$/i;

export type SourceStoryResult =
  | { kind: 'story'; story: SourceStory }
  /** The source already fed a published LazyFounders story: send readers there instead. */
  | { kind: 'published'; slug: string }
  /** Old UUID link or an out-of-date slug: send readers to the current path. */
  | { kind: 'moved'; path: string }
  | null;

/**
 * Id filter for a /news/source/ param: a full UUID (links made before slugs) or a slug
 * ending in the id's first 8 hex characters, matched as a primary-key range.
 */
function sourceIdWhere(param: string) {
  if (UUID_RE.test(param)) return { id: param.toLowerCase() };
  const m = SOURCE_SLUG_RE.exec(param);
  if (!m) return null;
  const hex = m[1].toLowerCase();
  return { id: { gte: `${hex}-0000-0000-0000-000000000000`, lte: `${hex}-ffff-ffff-ffff-ffffffffffff` } };
}

export async function getSourceStory(param: string): Promise<SourceStoryResult> {
  const idWhere = sourceIdWhere(param);
  if (!idWhere) return null;
  const candidates = await prisma.sourceArticle.findMany({
    where: { ...idWhere, ...SOURCE_VISIBLE_WHERE },
    take: 5,
    select: {
      id: true, headline: true, subheadline: true, author: true, bodyText: true,
      leadImage: true, imageCredit: true, publisher: true, language: true,
      publishedAt: true, fetchedAt: true, canonicalUrl: true, finalUrl: true, originalUrl: true, categories: true, tags: true,
      storySource: { select: { story: { select: { article: { select: { slug: true, publishedVersionId: true, status: true } } } } } },
      source: { select: { imagePolicy: true } },
    },
  });
  // Two ids sharing 8 hex characters is rare; the one whose headline matches the slug wins.
  const r = candidates.find((c) => c.headline && param === sourceStoryPath(c.id, c.headline).split('/').pop()) ?? candidates[0];
  if (!r || !r.headline) return null;
  const article = r.storySource?.story?.article;
  if (article?.publishedVersionId && !['ARCHIVED', 'REJECTED'].includes(article.status)) {
    return { kind: 'published', slug: article.slug };
  }
  const path = sourceStoryPath(r.id, r.headline);
  if (path !== `/news/source/${param}`) return { kind: 'moved', path };
  const sourceUrl = httpUrl(r.canonicalUrl) ?? httpUrl(r.finalUrl) ?? httpUrl(r.originalUrl);
  if (!sourceUrl) return null;
  return {
    kind: 'story',
    story: {
      id: r.id,
      sourceUrl,
      headline: sanitizeHeadline(r.headline),
      subheadline: sanitizeHeadline(r.subheadline),
      excerpt: excerptOf(sanitizeHeadline(r.subheadline || r.bodyText)),
      // Stored rows predate extraction-time cleaning: drop template keys and URLs here too.
      author: cleanAuthor(r.author, r.publisher),
      imageUrl: r.source.imagePolicy === 'none' ? null : httpUrl(r.leadImage),
      imageCredit: r.imageCredit,
      publisher: r.publisher,
      language: r.language,
      publishedAt: r.publishedAt ?? r.fetchedAt,
      // Categories only: tags are entities ("Meta", "OpenAI", "TechCrunch Disrupt"),
      // not subjects, and folding them in turns company names into topic sections.
      categories: r.categories ?? [],
      readTime: readTime(r.bodyText ?? ''),
      paragraphs: toParagraphs(r.bodyText),
    },
  };
}

export function headlineToArticleProps(h: SourceHeadline): ArticleProps {
  return {
    url: sourceStoryPath(h.id, h.headline),
    imageUrl: h.imageUrl || FALLBACK_IMAGE_PATH,
    category: h.publisher,
    title: sanitizeHeadline(h.headline),
    description: sanitizeHeadline(h.excerpt),
    authorInitials: h.publisher.slice(0, 2).toUpperCase(),
    authorName: h.publisher,
    readTime: h.readTime,
    publishedDate: formatDate(h.publishedAt),
    id: h.id,
    origin: 'wire',
    publishedAt: h.publishedAt.toISOString(),
  };
}

const LABEL_TTL_MS = 10 * 60 * 1000;
let labelCache: { own: string[]; source: string[]; expires: number } | null = null;

/**
 * Every distinct raw category label in both pools. Category pages translate a
 * site category back into these (see labelsForCategory) to filter in SQL. The
 * set only changes when the pipeline meets a new label, so a short process
 * cache saves two DISTINCT scans per category render.
 */
export async function listRawCategoryLabels(): Promise<{ own: string[]; source: string[] }> {
  if (labelCache && labelCache.expires > Date.now()) return labelCache;
  const [own, source] = await Promise.all([
    prisma.article.findMany({ where: PUBLIC_WHERE, select: { category: true }, distinct: ['category'] }),
    prisma.$queryRaw<{ label: string }[]>`SELECT DISTINCT unnest(categories) AS label FROM source_articles`,
  ]);
  const fresh = {
    own: own.map((r) => r.category).filter((c): c is string => Boolean(c)),
    source: source.map((r) => r.label).filter(Boolean),
    expires: Date.now() + LABEL_TTL_MS,
  };
  labelCache = fresh;
  return fresh;
}

/**
 * Read specific published articles through the public model, preserving the order
 * of the ids given. Search matches ids in one raw query (the public text lives on
 * the published version, which Prisma cannot reach cheaply) and then hydrates them
 * here, so search results carry exactly the same shape and visibility rules as
 * every other list on the site.
 */
export async function listPublishedArticlesByIds(ids: string[]): Promise<PublicArticle[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.article.findMany({ where: { id: { in: ids }, ...PUBLIC_WHERE } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  return (await withVersions(ordered)).map(toPublic);
}
