import { serveSitemap, sitemapIndexFiles, sitemapIndexXml } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

/** Sitemap index: points at the static, news, article, company and category files. */
export async function GET() {
  return serveSitemap('index', async () => sitemapIndexXml(await sitemapIndexFiles()));
}
