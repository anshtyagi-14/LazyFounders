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
}

const SELECT = { id: true, slug: true, name: true, jobTitle: true, bio: true, avatarUrl: true, sameAs: true } as const;

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
  return prisma.author.findUnique({ where: { slug }, select: SELECT });
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
let defaultCache: { author: PublicAuthor | null; expires: number } | null = null;

async function defaultAuthor(): Promise<PublicAuthor | null> {
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
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (id) => (id ? byId.get(id) : undefined) ?? fallback;
}
