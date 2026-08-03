import { MetadataRoute } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch all published articles
  const articles = await prisma.originalContent.findMany({
    select: {
      slug: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50000, // Standard max limit for a single sitemap file
  });

  // Use the environment variable for the base URL, or a placeholder if running locally
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const articleUrls: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${baseUrl}/news/article/${article.slug}`,
    lastModified: article.createdAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 1,
    },
    {
      url: `${baseUrl}/dashboard`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    ...articleUrls,
  ];
}
