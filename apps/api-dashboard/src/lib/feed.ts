import type { ArticleProps } from '@/components/FeaturedCard';
import {
  countPublishedArticles,
  countSourceHeadlines,
  headlineToArticleProps,
  listPublishedArticles,
  listRawCategoryLabels,
  listSourceHeadlines,
  slugifyCategory,
  toArticleProps,
  type PublicArticle,
  type SourceHeadline,
} from '@/lib/articles';
import { HOMEPAGE_SECTIONS, categoryForArticle, labelsForCategory, normalizeTopics, type CategorySlug, type TopicSectionSpec } from '@/lib/topics';

/**
 * The homepage reads one merged feed, not two.
 *
 * The site has two content pools: LazyFounders stories we published ourselves,
 * and stored stories from trusted sources that link back to the publisher. Both
 * already render through the same cards, so the topic sections treat them as one
 * stream and let recency decide the order. Own stories outrank a source story of
 * the same age, which is the only editorial thumb on the scale.
 *
 * This module sits above `articles.ts` rather than inside it because `topics.ts`
 * imports from `articles.ts`; merging here keeps the import graph acyclic.
 */

export interface FeedItem {
  id: string;
  props: ArticleProps;
  /** Normalised topic labels. The first is the one shown on the card. */
  topics: string[];
  publishedAt: Date;
  hasImage: boolean;
  /** True for our own published reporting, false for a stored source story. */
  isOwn: boolean;
  /** Independent sources backing the story. Zero for source stories. */
  citationCount: number;
}

export interface HomepageFeed {
  items: FeedItem[];
  /** Topic slug to items, newest first. */
  byTopic: Map<string, FeedItem[]>;
  /** Every topic present in the feed, most stories first. */
  topics: { slug: string; label: string; count: number }[];
}

export function ownToFeedItem(a: PublicArticle): FeedItem {
  // Category only, for the same reason source tags are ignored: Article.tags holds
  // entities, not subjects.
  // Our own stories always file under a category, even a legacy free-text one.
  const topics = [categoryForArticle(a.category).label];
  const props = toArticleProps(a);
  return {
    id: a.id,
    props: { ...props, category: topics[0] ?? props.category },
    topics,
    publishedAt: a.publishedAt,
    hasImage: Boolean(a.featuredImage?.url),
    isOwn: true,
    citationCount: a.citations.length,
  };
}

export function sourceToFeedItem(h: SourceHeadline): FeedItem {
  const topics = normalizeTopics(h.categories ?? []);
  const props = headlineToArticleProps(h);
  return {
    id: h.id,
    // headlineToArticleProps puts the publisher in `category`; the card wants the
    // topic there, and the publisher stays visible as the byline.
    props: { ...props, category: topics[0] ?? h.publisher },
    topics,
    publishedAt: h.publishedAt,
    hasImage: Boolean(h.imageUrl),
    isOwn: false,
    citationCount: 0,
  };
}

/** Newest first; an own story wins a tie against a source story of the same moment. */
function byRecency(a: FeedItem, b: FeedItem): number {
  const delta = b.publishedAt.getTime() - a.publishedAt.getTime();
  if (delta !== 0) return delta;
  return Number(b.isOwn) - Number(a.isOwn);
}

export async function loadHomepageFeed(opts: { pool?: number } = {}): Promise<HomepageFeed> {
  const pool = opts.pool ?? 120;
  const [published, headlines] = await Promise.all([
    listPublishedArticles({ take: pool }),
    listSourceHeadlines({ take: pool }),
  ]);

  const items = [...published.map(ownToFeedItem), ...headlines.map(sourceToFeedItem)].sort(byRecency);

  const byTopic = new Map<string, FeedItem[]>();
  const labels = new Map<string, string>();
  for (const item of items) {
    for (const topic of item.topics) {
      const slug = slugifyCategory(topic);
      if (!labels.has(slug)) labels.set(slug, topic);
      const bucket = byTopic.get(slug);
      if (bucket) bucket.push(item);
      else byTopic.set(slug, [item]);
    }
  }

  const topics = [...byTopic.entries()]
    .map(([slug, list]) => ({ slug, label: labels.get(slug) ?? slug, count: list.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { items, byTopic, topics };
}

const MIN_SECTION_ITEMS = 3;

export interface ResolvedSection extends TopicSectionSpec {
  items: FeedItem[];
}

/**
 * The six category sections, in masthead order. A section with too few stories
 * to read as a section is dropped rather than rendering a heading with nothing
 * under it.
 *
 * `used` carries ids already shown higher up the page so a story never appears twice.
 */
export function resolveSections(feed: HomepageFeed, used: Set<string>): ResolvedSection[] {
  const out: ResolvedSection[] = [];
  for (const spec of HOMEPAGE_SECTIONS) {
    const items: FeedItem[] = [];
    for (const item of feed.byTopic.get(spec.slug) ?? []) {
      if (used.has(item.id)) continue;
      items.push(item);
      if (items.length >= spec.take) break;
    }
    // A heading with one story under it reads as a mistake, not a section.
    if (items.length < MIN_SECTION_ITEMS) continue;
    items.forEach((i) => used.add(i.id));
    out.push({ ...spec, items });
  }
  return out;
}

/**
 * Top Picks: the newest story from each of the busiest beats, so the block reads
 * as the day's spread rather than one topic repeated.
 *
 * There is deliberately no "trending" here. The schema has no featured flag and
 * no view counter, so any popularity claim would be invented. Stories without an
 * image are skipped for the lead slots, where a placeholder would look broken.
 */
export function pickTopStories(feed: HomepageFeed, used: Set<string>, count = 5): FeedItem[] {
  const out: FeedItem[] = [];

  for (const topic of feed.topics) {
    if (out.length >= count) break;
    const candidate = (feed.byTopic.get(topic.slug) ?? []).find((i) => i.hasImage && !used.has(i.id));
    if (!candidate) continue;
    used.add(candidate.id);
    out.push(candidate);
  }

  // Backfill from the whole feed if the beats were too thin to fill the block.
  for (const item of feed.items) {
    if (out.length >= count) break;
    if (used.has(item.id) || !item.hasImage) continue;
    used.add(item.id);
    out.push(item);
  }

  return out;
}

/** The wire: strictly newest first, whatever the beat. */
export function pickJustIn(feed: HomepageFeed, used: Set<string>, count = 8): FeedItem[] {
  const out: FeedItem[] = [];
  for (const item of feed.items) {
    if (out.length >= count) break;
    if (used.has(item.id)) continue;
    used.add(item.id);
    out.push(item);
  }
  return out;
}

export interface CategoryFeedPage {
  items: FeedItem[];
  /** Stories across both pools filed under the category. */
  total: number;
}

/** How deep a category listing paginates; older stories stay reachable through the sitemap. */
export const CATEGORY_MAX_PAGES = 40;

/**
 * One page of a category: our stories and source stories filed under it,
 * merged newest first. Both pools are filtered in SQL through the raw labels
 * that fold into the category. The merge needs the first `page * perPage` of
 * each pool, which CATEGORY_MAX_PAGES keeps bounded.
 */
export async function listCategoryFeed(
  slug: CategorySlug,
  opts: { page?: number; perPage?: number; excludeId?: string } = {},
): Promise<CategoryFeedPage> {
  const perPage = Math.max(1, opts.perPage ?? 24);
  const page = Math.min(CATEGORY_MAX_PAGES, Math.max(1, opts.page ?? 1));
  const labels = await listRawCategoryLabels();
  const own = labelsForCategory(slug, labels.own);
  const source = labelsForCategory(slug, labels.source);
  // The pipeline default: an own story with an unmapped label files under Technology.
  if (slug === 'technology') {
    for (const l of labels.own) if (!own.includes(l) && categoryForArticle(l).slug === 'technology') own.push(l);
  }

  const depth = page * perPage + (opts.excludeId ? 1 : 0);
  const [ownRows, sourceRows, ownCount, sourceCount] = await Promise.all([
    own.length ? listPublishedArticles({ categories: own, take: depth }) : Promise.resolve([]),
    source.length ? listSourceHeadlines({ categories: source, take: depth }) : Promise.resolve([]),
    own.length ? countPublishedArticles({ categories: own }) : Promise.resolve(0),
    source.length ? countSourceHeadlines({ categories: source }) : Promise.resolve(0),
  ]);

  const merged = [...ownRows.map(ownToFeedItem), ...sourceRows.map(sourceToFeedItem)]
    .filter((i) => i.id !== opts.excludeId)
    .sort(byRecency);
  return {
    items: merged.slice((page - 1) * perPage, page * perPage),
    total: Math.min(ownCount + sourceCount, CATEGORY_MAX_PAGES * perPage),
  };
}
