import { Prisma } from '../generated/client';
import { prisma } from '@/lib/prisma';
import {
  headlineToArticleProps,
  listPublishedArticlesByIds,
  listSourceHeadlines,
  sanitizeHeadline,
  toArticleProps,
  type PublicArticle,
} from '@/lib/articles';
import type { ArticleProps } from '@/components/FeaturedCard';
import { normalizeTopics, categoryForArticle } from '@/lib/topics';

/**
 * Site search over both content pools.
 *
 * Published stories are split across `articles` and `article_versions` (the public
 * text lives on the version the `published_version_id` pointer names), which Prisma
 * cannot traverse cheaply, so the article side matches ids with one raw query and
 * then reuses the normal read model to build the result. Source stories are matched
 * in memory - the visible set is small and already de-duplicated by the existing
 * helper, so a second raw query would buy nothing.
 *
 * `pg_trgm` is enabled on the datasource but there is no GIN trigram index yet, so
 * ILIKE is a sequential scan. That is fine at this corpus size; the index is a
 * migration in `packages/database`, not a change here.
 */

export interface SearchResult {
  props: ArticleProps;
  isOwn: boolean;
}

const MAX_QUERY = 100;

/** Escape the LIKE metacharacters so a query of "100%" searches for a literal. */
function likePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (m) => '\\' + m);
  return '%' + escaped + '%';
}

export function normalizeQuery(raw: string | undefined | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
}

async function searchOwnArticles(q: string, take: number): Promise<PublicArticle[]> {
  const pattern = likePattern(q);
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id
    FROM articles a
    JOIN article_versions v ON v.id = a.published_version_id
    WHERE a.status NOT IN ('ARCHIVED', 'REJECTED')
      AND (
        v.headline ILIKE ${pattern}
        OR v.intro ILIKE ${pattern}
        OR v.meta_description ILIKE ${pattern}
        OR a.category ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM unnest(a.tags) t WHERE t ILIKE ${pattern})
        OR EXISTS (SELECT 1 FROM unnest(a.companies) c WHERE c ILIKE ${pattern})
      )
    ORDER BY a.published_at DESC NULLS LAST
    LIMIT ${take}
  `);
  return listPublishedArticlesByIds(rows.map((r) => r.id));
}

export async function searchStories(rawQuery: string, opts: { take?: number } = {}): Promise<SearchResult[]> {
  const q = normalizeQuery(rawQuery);
  if (!q) return [];
  const take = opts.take ?? 40;

  const [own, headlines] = await Promise.all([
    searchOwnArticles(q, take),
    listSourceHeadlines({ take: 200 }),
  ]);

  const needle = q.toLowerCase();
  const matchedSources = headlines.filter((h) => {
    // Match the normalised topic as well as the publisher's own label, so a
    // search for "funding" finds stories a publisher filed under "Fundraising".
    const hay = [h.headline, h.excerpt, h.publisher, ...(h.categories ?? []), ...normalizeTopics(h.categories ?? [])]
      .map((s) => sanitizeHeadline(s).toLowerCase())
      .join(' ');
    return hay.includes(needle);
  });

  const results: SearchResult[] = [
    ...own.map((a) => ({ props: { ...toArticleProps(a), category: categoryForArticle(a.category).label }, isOwn: true })),
    ...matchedSources.map((h) => {
      // headlineToArticleProps puts the publisher in the chip; every other list on
      // the site shows the topic there, and the publisher stays as the byline.
      const props = headlineToArticleProps(h);
      const topic = normalizeTopics(h.categories ?? [])[0];
      return { props: topic ? { ...props, category: topic } : props, isOwn: false };
    }),
  ];

  return results.slice(0, take);
}

/** Curated companies whose name contains the query: their hub pages are search results too. */
export function matchCompanies(rawQuery: string, names: readonly string[], limit = 8): string[] {
  const needle = normalizeQuery(rawQuery).toLowerCase();
  if (needle.length < 2) return [];
  return names.filter((n) => n.toLowerCase().includes(needle)).slice(0, limit);
}
