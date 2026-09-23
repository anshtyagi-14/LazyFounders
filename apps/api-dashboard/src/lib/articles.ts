import { prisma } from '@/lib/prisma';
import type { ArticleProps } from '../components/FeaturedCard';

/**
 * Public read model. Only versions that an editor (or the auto-publish policy) published
 * are ever shown: an article is public iff publishedVersionId is set and it is not
 * archived/rejected. Newer drafts of a published article stay invisible until published.
 */
const PUBLIC_WHERE = { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } };

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const BRAND = process.env.SITE_BRAND_NAME || 'LazyFounders';

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
  citations: PublicCitation[];
  readTime: number;
  isLegacy: boolean;
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
  return rows
    .map((a) => ({ a, v: a.publishedVersionId ? byId.get(a.publishedVersionId) : undefined }))
    .filter((x): x is { a: ArticleRow; v: NonNullable<typeof x.v> } => Boolean(x.v));
}

function toPublic(a: ArticleRow, v: Awaited<ReturnType<typeof withVersions>>[number]['v']): PublicArticle {
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
    intro: sanitizeHeadline(v.intro),
    bodyMarkdown: v.bodyMarkdown,
    featuredImage: (v.featuredImage as FeaturedImage | null) ?? null,
    citations: v.citations.map((c) => ({ position: c.position, publisher: c.publisher, url: c.url, title: c.title, language: c.language, publishedAt: c.publishedAt })),
    readTime: readTime(v.bodyMarkdown),
    isLegacy: Boolean(a.legacyContentId),
  };
}

export function toArticleProps(p: PublicArticle): ArticleProps {
  return {
    url: `/news/article/${p.slug}`,
    imageUrl: p.featuredImage?.url || '/placeholder.jpg',
    category: p.category,
    title: sanitizeHeadline(p.headline),
    description: sanitizeHeadline(p.metaDescription),
    authorInitials: BRAND.slice(0, 2).toUpperCase(),
    authorName: BRAND,
    readTime: p.readTime,
    publishedDate: formatDate(p.publishedAt),
  };
}

export async function listPublishedArticles(opts: { take?: number; category?: string; companies?: string[]; excludeId?: string } = {}): Promise<PublicArticle[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...PUBLIC_WHERE,
      ...(opts.companies?.length ? { companies: { hasSome: opts.companies } } : {}),
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    // Category slugs are matched in memory (legacy categories are free text).
    take: opts.category ? 500 : (opts.take ?? 28),
  });
  const filtered = opts.category ? rows.filter((r) => slugifyCategory(r.category || 'Technology') === opts.category).slice(0, opts.take ?? 50) : rows;
  return (await withVersions(filtered)).map(({ a, v }) => toPublic(a, v));
}

export async function getPublishedArticle(slug: string): Promise<PublicArticle | null> {
  const a = await prisma.article.findFirst({ where: { slug, ...PUBLIC_WHERE } });
  if (!a) return null;
  const [row] = await withVersions([a]);
  return row ? toPublic(row.a, row.v) : null;
}

/**
 * Stories straight from trusted sources, stored in the LazyFounders database and read on
 * /news/source/[id] with a courtesy link back to the original publisher. Items that
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
};

export function sourceStoryPath(id: string): string {
  return `/news/source/${id}`;
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

export async function listSourceHeadlines(opts: { take?: number } = {}): Promise<SourceHeadline[]> {
  const take = opts.take ?? 24;
  const rows = await prisma.sourceArticle.findMany({
    where: {
      ...SOURCE_VISIBLE_WHERE,
      NOT: { storySource: { is: { story: { is: { article: { is: { publishedVersionId: { not: null } } } } } } } },
    },
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { fetchedAt: 'desc' }],
    take: take * 3,
    select: {
      id: true, canonicalFingerprint: true, headline: true, subheadline: true, bodyText: true,
      leadImage: true, publisher: true, publishedAt: true, fetchedAt: true,
      canonicalUrl: true, finalUrl: true, originalUrl: true, categories: true, tags: true,
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
      imageUrl: httpUrl(r.leadImage),
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

export type SourceStoryResult =
  | { kind: 'story'; story: SourceStory }
  /** The source already fed a published LazyFounders story: send readers there instead. */
  | { kind: 'published'; slug: string }
  | null;

export async function getSourceStory(id: string): Promise<SourceStoryResult> {
  if (!UUID_RE.test(id)) return null;
  const r = await prisma.sourceArticle.findFirst({
    where: { id, ...SOURCE_VISIBLE_WHERE },
    select: {
      id: true, headline: true, subheadline: true, author: true, bodyText: true,
      leadImage: true, imageCredit: true, publisher: true, language: true,
      publishedAt: true, fetchedAt: true, canonicalUrl: true, finalUrl: true, originalUrl: true, categories: true, tags: true,
      storySource: { select: { story: { select: { article: { select: { slug: true, publishedVersionId: true, status: true } } } } } },
    },
  });
  if (!r || !r.headline) return null;
  const article = r.storySource?.story?.article;
  if (article?.publishedVersionId && !['ARCHIVED', 'REJECTED'].includes(article.status)) {
    return { kind: 'published', slug: article.slug };
  }
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
      author: r.author,
      imageUrl: httpUrl(r.leadImage),
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
    url: sourceStoryPath(h.id),
    imageUrl: h.imageUrl || '/placeholder.jpg',
    category: h.publisher,
    title: sanitizeHeadline(h.headline),
    description: sanitizeHeadline(h.excerpt),
    authorInitials: h.publisher.slice(0, 2).toUpperCase(),
    authorName: h.publisher,
    readTime: h.readTime,
    publishedDate: formatDate(h.publishedAt),
  };
}

export async function listCategories(): Promise<string[]> {
  const rows = await prisma.article.findMany({ where: PUBLIC_WHERE, select: { category: true }, distinct: ['category'], take: 50 });
  return rows.map((r) => r.category || 'Technology');
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
  return (await withVersions(ordered)).map(({ a, v }) => toPublic(a, v));
}
