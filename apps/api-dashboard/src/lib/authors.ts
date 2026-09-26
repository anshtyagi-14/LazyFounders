import { prisma } from '@/lib/prisma';

/** Byline credited on articles with no author of their own (set by the pipeline too). */
export const DEFAULT_AUTHOR_SLUG = process.env.DEFAULT_AUTHOR_SLUG || 'tarun-mottlia';

export interface PublicAuthor {
  id: string;
  slug: string;
  name: string;
  jobTitle: string;
  bio: string;
  avatarUrl: string | null;
  sameAs: string[];
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = {
  id: true,
  slug: true,
  name: true,
  jobTitle: true,
  bio: true,
  avatarUrl: true,
  sameAs: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Byline photos shipped with the site (apps/api-dashboard/public/authors). A photo stored on
 * the author row wins; this covers authors whose photo lives in the codebase instead.
 */
const AUTHOR_PHOTOS: Record<string, string> = {
  'tarun-mottlia': '/authors/tarun-mottlia.jpg',
};

function withPhoto<T extends { slug: string; avatarUrl: string | null }>(author: T): T {
  return author.avatarUrl ? author : { ...author, avatarUrl: AUTHOR_PHOTOS[author.slug] ?? null };
}

/** Same rule as the public article queries: a story counts once it has a live published version. */
const PUBLIC_ARTICLE = { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } };

export function authorPath(slug: string): string {
  return `/author/${slug}`;
}

export function authorInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export async function getAuthor(slug: string): Promise<PublicAuthor | null> {
  const author = await prisma.author.findUnique({ where: { slug }, select: SELECT });
  return author ? withPhoto(author) : null;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
let defaultCache: { author: PublicAuthor | null; expires: number } | null = null;

/** The LazyFounders byline, also shown as the curating editor on syndicated stories. */
export async function defaultAuthor(): Promise<PublicAuthor | null> {
  if (defaultCache && defaultCache.expires > Date.now()) return defaultCache.author;
  const author = await getAuthor(DEFAULT_AUTHOR_SLUG);
  defaultCache = { author, expires: Date.now() + DEFAULT_TTL_MS };
  return author;
}

/**
 * Authors for a set of articles, keyed by author id. Articles with no author (or one
 * that was deleted) resolve to the default byline under the key `null`.
 */
export async function loadAuthors(ids: Array<string | null>): Promise<(id: string | null) => PublicAuthor | null> {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const [rows, fallback] = await Promise.all([
    wanted.length ? prisma.author.findMany({ where: { id: { in: wanted } }, select: SELECT }) : Promise.resolve([]),
    defaultAuthor(),
  ]);
  const byId = new Map(rows.map((r) => [r.id, withPhoto(r)]));
  return (id) => (id ? byId.get(id) : undefined) ?? fallback;
}

export interface AuthorWithCount extends PublicAuthor {
  storyCount: number;
}

/** Every byline with at least one published story, most prolific first: the /authors hub. */
export async function listAuthors(): Promise<AuthorWithCount[]> {
  const counts = await prisma.article.groupBy({
    by: ['authorId'],
    where: { ...PUBLIC_ARTICLE, authorId: { not: null } },
    _count: { _all: true },
  });
  if (counts.length === 0) return [];
  const rows = await prisma.author.findMany({ where: { id: { in: counts.map((c) => c.authorId!) } }, select: SELECT });
  const byId = new Map(counts.map((c) => [c.authorId, c._count._all]));
  return rows
    .map((r) => ({ ...withPhoto(r), storyCount: byId.get(r.id) ?? 0 }))
    .sort((a, b) => b.storyCount - a.storyCount || a.name.localeCompare(b.name));
}

/**
 * The raw categories an author has published in, most-covered first. The page maps them to
 * site sections for schema.org knowsAbout, so the claim is what the byline actually covers.
 */
export async function authorBeats(authorId: string): Promise<string[]> {
  const rows = await prisma.article.groupBy({
    by: ['category'],
    where: { ...PUBLIC_ARTICLE, authorId },
    _count: { _all: true },
  });
  return rows
    .sort((a, b) => b._count._all - a._count._all)
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c));
}
