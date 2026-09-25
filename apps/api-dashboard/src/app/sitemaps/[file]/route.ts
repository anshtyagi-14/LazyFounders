import {
  articleEntries,
  articleFileCount,
  categoryEntries,
  companyEntries,
  companyFileCount,
  newsEntries,
  serveSitemap,
  staticEntries,
  urlsetXml,
} from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ file: string }> };

/** /sitemaps/{static,news,categories,articles-N,companies-N}.xml; anything else is a 404. */
export async function GET(_req: Request, { params }: Props) {
  const { file } = await params;

  if (file === 'static.xml') return serveSitemap(file, async () => urlsetXml(await staticEntries()));
  if (file === 'news.xml') return serveSitemap(file, async () => urlsetXml(await newsEntries()));
  if (file === 'categories.xml') return serveSitemap(file, async () => urlsetXml(await categoryEntries()));

  const paged = /^(articles|companies)-([1-9]\d{0,3})\.xml$/.exec(file);
  if (paged) {
    const page = Number(paged[2]);
    if (paged[1] === 'articles') {
      return serveSitemap(file, async () => (page > (await articleFileCount()) ? null : urlsetXml(await articleEntries(page))));
    }
    return serveSitemap(file, async () => (page > (await companyFileCount()) ? null : urlsetXml(await companyEntries(page))));
  }

  return new Response('Not found', { status: 404 });
}
