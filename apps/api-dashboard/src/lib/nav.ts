import { prisma } from '@/lib/prisma';
import { slugifyCategory } from '@/lib/articles';
import { normalizeTopics } from '@/lib/topics';

/**
 * Navigation data for the masthead and the footer.
 *
 * The header renders on every route and every route is `force-dynamic`, so an
 * uncached read here would be a per-request tax on the whole site. The topic list
 * changes on the pipeline's schedule, not the reader's, so a short process-level
 * TTL is the right cache: the standalone server is long-lived, so this survives
 * across requests without fighting `force-dynamic` the way route caching would.
 */

const TOPIC_TTL_MS = 10 * 60 * 1000;

export interface NavTopic {
  slug: string;
  label: string;
}

let topicCache: { value: NavTopic[]; expires: number } | null = null;

async function readTopics(): Promise<NavTopic[]> {
  // Both pools label topics, and neither alone is complete: published stories
  // carry one free-text category, source stories carry an array of publisher
  // labels. The masthead lists whatever a reader can actually browse to.
  const [own, source] = await Promise.all([
    prisma.article.findMany({
      where: { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } },
      select: { category: true },
      distinct: ['category'],
      take: 60,
    }),
    prisma.sourceArticle.findMany({
      where: {
        headline: { not: null },
        paywalled: false,
        state: { notIn: ['ARCHIVED', 'REJECTED'] },
        source: { trustStatus: 'APPROVED', enabled: true },
      },
      select: { categories: true },
      orderBy: { fetchedAt: 'desc' },
      take: 400,
    }),
  ]);

  const raw = [...own.map((r) => r.category), ...source.flatMap((r) => r.categories ?? [])];
  return normalizeTopics(raw)
    .map((label) => ({ slug: slugifyCategory(label), label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getNavTopics(): Promise<NavTopic[]> {
  const now = Date.now();
  if (topicCache && topicCache.expires > now) return topicCache.value;
  try {
    const value = await readTopics();
    topicCache = { value, expires: now + TOPIC_TTL_MS };
    return value;
  } catch {
    // The masthead must render even when the database is unreachable.
    return topicCache?.value ?? [];
  }
}

export interface NavLink {
  label: string;
  href: string;
  /** Marks a destination that is not built yet, so the UI can say so. */
  soon?: boolean;
}

/** Top-level masthead links that are not dropdowns. */
export const PRIMARY_LINKS: NavLink[] = [
  { label: 'Just In', href: '/#just-in' },
  { label: 'Sources', href: '/#from-the-wire' },
  { label: 'Newsletter', href: '/coming-soon', soon: true },
];

/**
 * Footer columns. Topics and Companies are filled from live data at render time;
 * these are the fixed ones. Only destinations that genuinely do not exist yet
 * point at /coming-soon.
 */
export const FOOTER_LINKS: { title: string; items: NavLink[] }[] = [
  {
    title: 'Read',
    items: [
      { label: 'Latest stories', href: '/#just-in' },
      { label: 'From the wire', href: '/#from-the-wire' },
      { label: 'RSS feed', href: '/feed.xml' },
      { label: 'Newsletter', href: '/coming-soon', soon: true },
    ],
  },
  {
    title: 'Developers',
    items: [
      { label: 'API', href: '/developers' },
      { label: 'Sitemap', href: '/sitemap.xml' },
      { label: 'News sitemap', href: '/news-sitemap.xml' },
      { label: 'llms.txt', href: '/llms.txt' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'About', href: '/coming-soon', soon: true },
      { label: 'Contact', href: '/coming-soon', soon: true },
      { label: 'Privacy policy', href: '/coming-soon', soon: true },
      { label: 'Terms', href: '/coming-soon', soon: true },
    ],
  },
];

export const SOCIAL_LINKS: NavLink[] = [
  { label: 'X', href: 'https://x.com/lazyfounders' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/lazyfounders' },
  { label: 'Instagram', href: 'https://www.instagram.com/lazyfounders.in/' }
];
