import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { SITE_URL, slugifyCategory } from '@/lib/articles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Sitemaps cap at 50,000 URLs; leave room for the category and company entries. */
const MAX_ARTICLES = 45000;

function slugifyCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

/**
 * Public URLs only: published stories, their categories, the company hubs that actually
 * have coverage, and the home page. Rebuilt on every request (revalidate = 0), so a story
 * published a second ago is already listed.
 *
 * Syndicated source stories (/news/source/*) are deliberately absent — they canonicalise
 * to the original publisher, so listing them would ask Google to index a duplicate.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await prisma.article.findMany({
    where: { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } },
    select: { slug: true, updatedAt: true, publishedAt: true, category: true, companies: true, publishedVersionId: true },
    orderBy: { publishedAt: 'desc' },
    take: MAX_ARTICLES,
  });

  // Lead images belong in the sitemap: they are what Google Images and Discover surface.
  const versionIds = articles.map((a) => a.publishedVersionId).filter((x): x is string => Boolean(x));
  const versions = versionIds.length
    ? await prisma.articleVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, featuredImage: true } })
    : [];
  const imageByVersion = new Map(
    versions.map((v) => [v.id, (v.featuredImage as { url?: string } | null)?.url]),
  );

  const categories = [...new Set(articles.map((a) => a.category).filter((c): c is string => Boolean(c)))];

  // Newest story per category / company drives that hub page's lastModified.
  const newestByCategory = new Map<string, Date>();
  const newestByCompany = new Map<string, Date>();
  for (const a of articles) {
    const when = a.updatedAt ?? a.publishedAt;
    if (!when) continue;
    if (a.category && !newestByCategory.has(a.category)) newestByCategory.set(a.category, when);
    for (const c of a.companies ?? []) {
      const name = c.trim();
      if (name && !newestByCompany.has(name)) newestByCompany.set(name, when);
    }
  }

  return [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    ...categories.map((c) => ({
      url: `${SITE_URL}/news/category/${slugifyCategory(c)}`,
      lastModified: newestByCategory.get(c),
      changeFrequency: 'hourly' as const,
      priority: 0.6,
    })),
    ...articles.map((a) => {
      const image = a.publishedVersionId ? imageByVersion.get(a.publishedVersionId) : undefined;
      return {
        url: `${SITE_URL}/news/article/${a.slug}`,
        lastModified: a.updatedAt ?? a.publishedAt ?? undefined,
        changeFrequency: 'daily' as const,
        priority: 0.8,
        ...(image ? { images: [image] } : {}),
      };
    }),
    ...[...newestByCompany.entries()].map(([name, when]) => ({
      url: `${SITE_URL}/company/${slugifyCompany(name)}`,
      lastModified: when,
      changeFrequency: 'daily' as const,
      priority: 0.5,
    })),
  ];
}
