import type { Transport, TransportResponse } from '../net/safe-fetch';

export interface FakeRoute {
  status?: number;
  body?: string | Buffer;
  headers?: Record<string, string>;
}

/**
 * In-process HTTP transport for tests. Routes are keyed by absolute URL. A route may be
 * a function to emulate conditional GETs (ETag / Last-Modified).
 */
export function fakeTransport(routes: Record<string, FakeRoute | ((headers: Record<string, string>) => FakeRoute)>): Transport & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async ({ url, headers }) => {
    const key = url.toString();
    calls.push(key);
    const r = routes[key];
    const route: FakeRoute = typeof r === 'function' ? r(headers) : (r ?? { status: 404, body: 'not found' });
    const body = route.body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body);
    const res: TransportResponse = {
      status: route.status ?? 200,
      headers: new Headers(route.headers ?? {}),
      body: (async function* () {
        if (body.length) yield new Uint8Array(body);
      })(),
    };
    return res;
  }) as Transport & { calls: string[] };
  fn.calls = calls;
  return fn;
}

/** Every hostname resolves to a public documentation-range-safe unicast IP unless overridden. */
export function fakeResolver(overrides: Record<string, string[]> = {}) {
  return async (host: string) => overrides[host] ?? ['93.184.216.34'];
}

export function sitemapIndex(children: Array<{ loc: string; lastmod?: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children
    .map((c) => `<sitemap><loc>${c.loc}</loc>${c.lastmod ? `<lastmod>${c.lastmod}</lastmod>` : ''}</sitemap>`)
    .join('')}</sitemapindex>`;
}

export function urlset(urls: Array<{ loc: string; lastmod?: string; news?: { title: string; date: string } }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls
    .map(
      (u) =>
        `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${
          u.news ? `<news:news><news:publication_date>${u.news.date}</news:publication_date><news:title>${u.news.title}</news:title></news:news>` : ''
        }</url>`,
    )
    .join('')}</urlset>`;
}

export function rss(items: Array<{ link: string; title: string; pubDate: string; content?: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Feed</title>${items
    .map(
      (i) =>
        `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><pubDate>${i.pubDate}</pubDate>${
          i.content ? `<content:encoded><![CDATA[${i.content}]]></content:encoded>` : ''
        }</item>`,
    )
    .join('')}</channel></rss>`;
}

export function articleHtml(a: {
  lang: string;
  headline: string;
  paragraphs: string[];
  canonical?: string;
  published?: string;
  author?: string;
  image?: string;
  publisher?: string;
  extraHead?: string;
  jsonLd?: Record<string, unknown> | false;
}): string {
  const ld =
    a.jsonLd === false
      ? ''
      : `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: a.headline,
          datePublished: a.published ?? '2026-09-20T08:00:00Z',
          author: { '@type': 'Person', name: a.author ?? 'Staff Reporter' },
          image: a.image ? { '@type': 'ImageObject', url: a.image, creditText: 'Photo: Company handout' } : undefined,
          publisher: { '@type': 'Organization', name: a.publisher ?? 'Publisher' },
          inLanguage: a.lang,
          ...(a.jsonLd ?? {}),
        })}</script>`;
  return `<!doctype html><html lang="${a.lang}"><head><title>${a.headline}</title>
${a.canonical ? `<link rel="canonical" href="${a.canonical}">` : ''}
<meta property="og:title" content="${a.headline}">
${a.image ? `<meta property="og:image" content="${a.image}">` : ''}
${ld}${a.extraHead ?? ''}</head>
<body><header><nav><a href="/">Home</a></nav></header>
<article><h1>${a.headline}</h1>${a.paragraphs.map((p) => `<p>${p}</p>`).join('\n')}</article>
<footer>Copyright</footer></body></html>`;
}
