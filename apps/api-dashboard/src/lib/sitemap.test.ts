import { describe, expect, test } from 'vitest';

import { STATIC_PATHS, sitemapIndexXml, urlsetXml } from './sitemap';

/** Every & in the document must start an entity; a bare one truncates the sitemap for Google. */
function hasBareAmpersand(xml: string): boolean {
  return /&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml);
}

describe('urlsetXml', () => {
  test('escapes third-party image URLs and headlines', () => {
    const xml = urlsetXml([
      {
        loc: 'https://lazyfounder.in/news/article/a-b',
        lastmod: new Date('2026-09-25T00:00:00Z'),
        images: ['https://cdn.example.com/i.jpg?w=1200&format=jpeg'],
        news: { title: 'Q&A: <Funding> "rounds"', publishedAt: new Date('2026-09-25T00:00:00Z') },
      },
    ]);
    expect(hasBareAmpersand(xml)).toBe(false);
    expect(xml).toContain('<image:loc>https://cdn.example.com/i.jpg?w=1200&amp;format=jpeg</image:loc>');
    expect(xml).toContain('<news:title>Q&amp;A: &lt;Funding&gt; &quot;rounds&quot;</news:title>');
    expect(xml).toContain('<lastmod>2026-09-25T00:00:00.000Z</lastmod>');
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
  });

  test('drops characters XML 1.0 forbids, which would make the whole file unparseable', () => {
    const xml = urlsetXml([
      {
        loc: 'https://lazyfounder.in/news/article/a',
        news: { title: 'Pay\u0008tm \u000Braises\u0000 ￾$10M \uD800in 🚀 round\tnow', publishedAt: new Date(0) },
      },
    ]);
    expect(xml).not.toMatch(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u);
    expect(xml).toContain('<news:title>Paytm raises $10M in 🚀 round\tnow</news:title>');
  });

  test('omits optional elements it has no value for', () => {
    const xml = urlsetXml([{ loc: 'https://lazyfounder.in/about' }]);
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<news:news>');
    expect(xml).not.toContain('<image:image>');
  });
});

describe('sitemapIndexXml', () => {
  test('lists each child sitemap', () => {
    const xml = sitemapIndexXml([{ loc: 'https://lazyfounder.in/sitemaps/static.xml' }, { loc: 'https://lazyfounder.in/sitemaps/news.xml', lastmod: new Date(0) }]);
    expect(xml.match(/<sitemap>/g)).toHaveLength(2);
    expect(xml).toContain('<sitemapindex');
  });
});

describe('static sitemap', () => {
  test('covers the home page and the seven trust pages, nothing private', () => {
    expect(STATIC_PATHS).toEqual(['/', '/about', '/contact', '/editorial-policy', '/ai-policy', '/corrections', '/disclaimer', '/terms']);
  });
});
