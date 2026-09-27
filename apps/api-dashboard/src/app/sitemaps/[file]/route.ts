import {
  ARTICLES_PER_FILE,
  articleEntries,
  authorEntries,
  categoryEntries,
  companyEntries,
  companyFileCount,
  newsEntries,
  pageEntries,
  sectionBuckets,
  serveSitemap,
  urlsetXml,
} from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ file: string }> };

/**
 * /sitemaps/{pages,categories,authors,news}.xml, articles-<category>-N.xml and
 * companies-N.xml; anything else is a 404. Old static.xml / articles-N.xml names
 * redirect in next.config.ts.
 */
export async function GET(_req: Request, { params }: Props) {
  const { file } = await params;

  if (file === 'pages.xml') return serveSitemap(file, async () => urlsetXml(await pageEntries()));
  if (file === 'categories.xml') return serveSitemap(file, async () => urlsetXml(await categoryEntries()));
  if (file === 'authors.xml') return serveSitemap(file, async () => urlsetXml(await authorEntries()));
  if (file === 'news.xml') return serveSitemap(file, async () => urlsetXml(await newsEntries()));

  const section = /^articles-([a-z]+)-([1-9]\d{0,3})\.xml$/.exec(file);
  if (section) {
    const page = Number(section[2]);
    return serveSitemap(file, async () => {
      const bucket = (await sectionBuckets()).find((b) => b.slug === section[1]);
      if (!bucket || page > Math.max(1, Math.ceil(bucket.count / ARTICLES_PER_FILE))) return null;
      return urlsetXml(await articleEntries(bucket, page));
    });
  }

  const companies = /^companies-([1-9]\d{0,3})\.xml$/.exec(file);
  if (companies) {
    const page = Number(companies[1]);
    return serveSitemap(file, async () => (page > (await companyFileCount()) ? null : urlsetXml(await companyEntries(page))));
  }

  return new Response('Not found', { status: 404 });
}
