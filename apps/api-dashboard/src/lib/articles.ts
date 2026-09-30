import { prisma } from '@/lib/prisma';
import { scrubForeignContacts, slugify, stripAuthorBio, stripInlineMarkdown } from '@lazyfounders/ingestion-core/editorial';
import { authorInitials, authorPath, defaultAuthor, loadAuthors, type PublicAuthor } from '@/lib/authors';
import type { ArticleProps } from '../components/FeaturedCard';
import { coverPath, coverPathForStoryUrl } from '@/lib/covers';
import { currentStoryImageMode, loadStoryImageMode } from '@/lib/site-settings';

/**
 * Public read model. Only versions that an editor (or the auto-publish policy) published
 * are ever shown: an article is public iff publishedVersionId is set and it is not
 * archived/rejected. Newer drafts of a published article stay invisible until published.
 */
const PUBLIC_WHERE = { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } };

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const BRAND = process.env.SITE_BRAND_NAME || 'Lazyfounder';

/**
 * Every story, ours or syndicated, lives at /news/<slug>: plain words from the headline,
 * unique across both kinds (see migration 20260930000000_clean_story_slugs). Our
 * articles are looked up first, then syndicated stories.
 */
export function articlePath(slug: string): string {
  return `/news/${slug}`;
}
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
  /** The publisher's lead image the pipeline stored. Shown only in the "publisher" story_images mode. */
  featuredImage: FeaturedImage | null;
  /**
   * Publisher mode only: another cited source's lead image, used when the story
   * has none of its own. Only loaded for the article page.
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

  // These fields print as text, so emphasis the model or the publisher wrote as markdown
  // (*WIRED*, **$33M**) would show up as literal asterisks.
  return stripInlineMarkdown(decoded.replace(/\s+/g, ' ').trim()).trim();
}

type ArticleRow = Awaited<ReturnType<typeof prisma.article.findMany>>[number];

async function withVersions(rows: ArticleRow[]) {
  // Every loader of our own stories passes through here; the card mappers read the mode synchronously.
  await loadStoryImageMode();
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

/**
 * The image to hand to feeds, sitemaps and share cards for one of our stories:
 * the headline cover card, or in "publisher" mode the publisher's photo (null if none).
 * Absolute for a cover; a publisher URL is absolute already.
 */
export function storyShareImage(p: Pick<PublicArticle, 'slug' | 'featuredImage'>): string | null {
  return currentStoryImageMode() === 'covers' ? `${SITE_URL}${coverPath(p.slug)}` : p.featuredImage?.url ?? null;
}

export function toArticleProps(p: PublicArticle): ArticleProps {
  return {
    url: articlePath(p.slug),
    imageUrl: currentStoryImageMode() === 'covers' ? coverPath(p.slug, 'art') : p.featuredImage?.url || FALLBACK_IMAGE_PATH,
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
  if (currentStoryImageMode() === 'publisher' && !article.featuredImage?.url && a.storyId) {
    article.sourceImage = await storySourceImage(a.storyId);
  }
  return article;
}

/** The current slug of a published article that used to live at `slug`, for a 301. */
export async function movedArticleSlug(slug: string): Promise<string | null> {
  const a = await prisma.article.findFirst({ where: { previousSlugs: { has: slug }, ...PUBLIC_WHERE }, select: { slug: true } });
  return a?.slug ?? null;
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
 * /news/[slug] with a courtesy link back to the original publisher. Items that
 * already belong to a published LazyFounders story are left out so a story never shows twice.
 */
export interface SourceHeadline {
  id: string;
  /** Stored URL slug; null only on rows written before slugs existed (see sourceStoryPath). */
  slug: string | null;
  /** Original publisher URL (shown in the courtesy section). */
  sourceUrl: string;
  headline: string;
  excerpt: string;
  /** What cards show: our cover art, or in "publisher" mode the publisher's photo (else the brand card). */
  imageUrl: string;
  /** The publisher's lead image when its source allows showing it. Used only in "publisher" mode. */
  publisherImageUrl: string | null;
  publisher: string;
  publishedAt: Date;
  /** Raw publisher category labels. Normalise with normalizeTopics() before display. */
  categories?: string[];
  readTime: number;
  /**
   * Our byline on a syndicated story: the LazyFounders editor who curated it. The
   * publisher's own reporter is never shown; the publisher is credited instead.
   */
  editor: PublicAuthor | null;
}

export interface SourceStory extends SourceHeadline {
  subheadline: string | null;
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

/** Hex characters of the id that the old URL format carried; still resolved, then 301'd. */
const SOURCE_ID_PREFIX = 8;

/**
 * "/news/<slug>" from the stored slug. A row without one (written before the slug
 * column, or before its headline arrived) falls back to the old
 * "<headline words>-<first 8 hex of the id>" form, which still resolves.
 */
export function sourceStoryPath(story: { id: string; headline: string; slug?: string | null }): string {
  if (story.slug) return articlePath(story.slug);
  // Whole words only, up to ~70 characters: a cut word reads as a typo in search results.
  let words = '';
  for (const w of slugify(sanitizeHeadline(story.headline)).split('-')) {
    if (words && words.length + w.length + 1 > 70) break;
    words = words ? `${words}-${w}` : w;
  }
  return articlePath(`${words}-${story.id.slice(0, SOURCE_ID_PREFIX).toLowerCase()}`);
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
  const editorP = defaultAuthor();
  const mode = await loadStoryImageMode();
  const rows = await prisma.sourceArticle.findMany({
    where: sourceListWhere(opts.categories),
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { fetchedAt: 'desc' }],
    take: take * 3,
    select: {
      id: true, slug: true, canonicalFingerprint: true, headline: true, subheadline: true, bodyText: true,
      leadImage: true, publisher: true, publishedAt: true, fetchedAt: true,
      canonicalUrl: true, finalUrl: true, originalUrl: true, categories: true, tags: true,
      source: { select: { imagePolicy: true } },
    },
  });
  const editor = await editorP;
  const seen = new Set<string>();
  const out: SourceHeadline[] = [];
  for (const r of rows) {
    const url = httpUrl(r.canonicalUrl) ?? httpUrl(r.finalUrl) ?? httpUrl(r.originalUrl);
    if (!url || !r.headline || seen.has(r.canonicalFingerprint)) continue;
    seen.add(r.canonicalFingerprint);
    // A source that has not licensed its images for display gets the brand card.
    const publisherImageUrl = r.source.imagePolicy === 'none' ? null : httpUrl(r.leadImage);
    out.push({
      id: r.id,
      slug: r.slug,
      sourceUrl: url,
      headline: sanitizeHeadline(r.headline),
      excerpt: excerptOf(sanitizeHeadline(scrubForeignContacts(r.subheadline || r.bodyText || '').text)),
      imageUrl: mode === 'covers' ? coverPathForStoryUrl(sourceStoryPath({ id: r.id, slug: r.slug, headline: r.headline }), 'art') : publisherImageUrl ?? FALLBACK_IMAGE_PATH,
      publisherImageUrl,
      publisher: r.publisher,
      publishedAt: r.publishedAt ?? r.fetchedAt,
      // Categories only: tags are entities ("Meta", "OpenAI", "TechCrunch Disrupt"),
      // not subjects, and folding them in turns company names into topic sections.
      categories: r.categories ?? [],
      readTime: readTime(r.bodyText ?? ''),
      editor,
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
 * Id filter for an old-format syndicated-story URL: a full UUID (links made before slugs)
 * or a slug ending in the id's first 8 hex characters, matched as a primary-key range.
 */
function sourceIdWhere(param: string) {
  if (UUID_RE.test(param)) return { id: param.toLowerCase() };
  const m = SOURCE_SLUG_RE.exec(param);
  if (!m) return null;
  const hex = m[1].toLowerCase();
  return { id: { gte: `${hex}-0000-0000-0000-000000000000`, lte: `${hex}-ffff-ffff-ffff-ffffffffffff` } };
}

const SOURCE_STORY_SELECT = {
  id: true, slug: true, headline: true, subheadline: true, author: true, bodyText: true,
  leadImage: true, imageCredit: true, publisher: true, language: true,
  publishedAt: true, fetchedAt: true, canonicalUrl: true, finalUrl: true, originalUrl: true, categories: true, tags: true,
  storySource: { select: { story: { select: { article: { select: { slug: true, publishedVersionId: true, status: true } } } } } },
  source: { select: { imagePolicy: true } },
} as const;

export async function getSourceStory(param: string): Promise<SourceStoryResult> {
  const editorP = defaultAuthor();
  const mode = await loadStoryImageMode();
  // The stored slug first; then the old "-<8 hex of the id>" and bare-UUID forms, which 301.
  let candidates = await prisma.sourceArticle.findMany({ where: { slug: param, ...SOURCE_VISIBLE_WHERE }, take: 1, select: SOURCE_STORY_SELECT });
  if (!candidates.length) {
    const idWhere = sourceIdWhere(param);
    if (!idWhere) return null;
    candidates = await prisma.sourceArticle.findMany({ where: { ...idWhere, ...SOURCE_VISIBLE_WHERE }, take: 5, select: SOURCE_STORY_SELECT });
  }
  // Two ids sharing 8 hex characters is rare; the one whose headline matches the old slug wins.
  const r = candidates.find((c) => c.headline && param === sourceStoryPath({ id: c.id, headline: c.headline }).split('/').pop()) ?? candidates[0];
  if (!r || !r.headline) return null;
  const article = r.storySource?.story?.article;
  if (article?.publishedVersionId && !['ARCHIVED', 'REJECTED'].includes(article.status)) {
    return { kind: 'published', slug: article.slug };
  }
  const path = sourceStoryPath({ id: r.id, slug: r.slug, headline: r.headline });
  if (path !== articlePath(param)) return { kind: 'moved', path };
  const sourceUrl = httpUrl(r.canonicalUrl) ?? httpUrl(r.finalUrl) ?? httpUrl(r.originalUrl);
  if (!sourceUrl) return null;
  // Stored text predates extraction-time cleaning: drop reporter bios and any
  // third-party contact here, so neither ever reaches the page.
  const paragraphs = stripAuthorBio(toParagraphs(scrubForeignContacts(r.bodyText ?? '').text), r.author);
  const bodyText = paragraphs.join('\n');
  const publisherImageUrl = r.source.imagePolicy === 'none' ? null : httpUrl(r.leadImage);
  return {
    kind: 'story',
    story: {
      id: r.id,
      slug: r.slug,
      sourceUrl,
      headline: sanitizeHeadline(r.headline),
      subheadline: sanitizeHeadline(scrubForeignContacts(r.subheadline ?? '').text) || null,
      excerpt: excerptOf(sanitizeHeadline(r.subheadline || bodyText)),
      editor: await editorP,
      imageUrl: mode === 'covers' ? coverPathForStoryUrl(path, 'art') : publisherImageUrl ?? FALLBACK_IMAGE_PATH,
      publisherImageUrl,
      imageCredit: r.imageCredit,
      publisher: r.publisher,
      language: r.language,
      publishedAt: r.publishedAt ?? r.fetchedAt,
      // Categories only: tags are entities ("Meta", "OpenAI", "TechCrunch Disrupt"),
      // not subjects, and folding them in turns company names into topic sections.
      categories: r.categories ?? [],
      readTime: readTime(bodyText),
      paragraphs,
    },
  };
}

export function headlineToArticleProps(h: SourceHeadline): ArticleProps {
  return {
    url: sourceStoryPath(h),
    imageUrl: h.imageUrl,
    category: h.publisher,
    title: sanitizeHeadline(h.headline),
    description: sanitizeHeadline(h.excerpt),
    authorInitials: h.editor ? authorInitials(h.editor.name) : BRAND.slice(0, 2).toUpperCase(),
    authorName: h.editor?.name ?? BRAND,
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
