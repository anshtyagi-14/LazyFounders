import { describe, expect, test } from 'vitest';

import { STATIC_PATHS, bucketByCategory, sitemapIndexXml, urlsetXml } from './sitemap';

/** Every & in the document must start an entity; a bare one truncates the sitemap for Google. */
function hasBareAmpersand(xml: string): boolean {
  return /&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml);
}

describe('urlsetXml', () => {
  test('escapes third-party image URLs and headlines', () => {
    const xml = urlsetXml([
      {
        loc: 'https://lazyfounder.in/news/a-b',
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
        loc: 'https://lazyfounder.in/news/a',
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
    const xml = sitemapIndexXml([{ loc: 'https://lazyfounder.in/sitemaps/pages.xml' }, { loc: 'https://lazyfounder.in/sitemaps/news.xml', lastmod: new Date(0) }]);
    expect(xml.match(/<sitemap>/g)).toHaveLength(2);
    expect(xml).toContain('<sitemapindex');
  });
});

describe('static sitemap', () => {
  test('covers the home page and the seven trust pages, nothing private', () => {
    expect(STATIC_PATHS).toEqual(['/', '/about', '/contact', '/editorial-policy', '/ai-policy', '/corrections', '/disclaimer', '/terms']);
  });
});

describe('bucketByCategory', () => {
  const d = (s: string) => new Date(`2026-09-${s}T00:00:00Z`);

  test('files every raw label under exactly one section and sums the counts', () => {
    const buckets = bucketByCategory([
      { category: 'funding', count: 3, lastmod: d('20') },
      { category: 'startup', count: 2, lastmod: d('25') },
      { category: 'business', count: 1, lastmod: d('21') },
      { category: null, count: 4, lastmod: d('22') },
      { category: 'something-unmapped', count: 1, lastmod: d('23') },
    ]);
    const by = Object.fromEntries(buckets.map((b) => [b.slug, b]));
    expect(buckets.map((b) => b.slug)).toEqual(['funding', 'ai', 'policy', 'technology', 'business', 'product']);
    expect(by.funding).toMatchObject({ labels: ['funding'], count: 3, lastmod: d('20') });
    expect(by.business).toMatchObject({ labels: ['startup', 'business'], count: 3, lastmod: d('25') });
    // Uncategorised and unmapped stories land in Technology, as on the article page.
    expect(by.technology).toMatchObject({ labels: ['something-unmapped'], includesNull: true, count: 5, lastmod: d('23') });
    expect(by.ai.count).toBe(0);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(11);
  });
});
