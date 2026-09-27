import { serveSitemap, sitemapIndexFiles, sitemapIndexXml } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

/** Sitemap index: pages, categories, authors, Google News, per-category articles and companies. */
export async function GET() {
  return serveSitemap('index', async () => sitemapIndexXml(await sitemapIndexFiles()));
}
