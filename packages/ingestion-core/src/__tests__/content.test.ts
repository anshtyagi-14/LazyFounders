import { describe, expect, it } from 'vitest';
import { cleanAuthor } from '../content/author';
import { extractArticle } from '../content/extract';
import { detectLanguage } from '../content/language';
import { detectPaywall } from '../content/paywall';
import { contentHash, htmlToText, sanitizeArticleHtml } from '../content/sanitize';
import { getAdapter } from '../registry/adapters';
import { articleHtml } from './helpers';

const LONG_EN = [
  'Quick-commerce startup Zepto has raised $25 million in a Series B round led by Nexus Venture Partners, the company said on Tuesday.',
  'Existing investor Y Combinator also joined the round, which the company said would fund expansion of its dark-store network.',
  'The company was founded in 2021 by Aadit Palicha and Kaivalya Vohra and operates in several large Indian cities.',
  'Analysts expect competition in the category to intensify as incumbents add faster delivery options for groceries.',
];

describe('sanitisation', () => {
  // Required test 6
  it('removes scripts, event handlers, dangerous URLs and embeds', () => {
    const dirty = `<p onclick="steal()">Hello <b>world</b><script>alert(1)</script></p>
      <img src="x.png" onerror="alert(2)"><a href="javascript:alert(3)">bad</a><a href="/ok">ok</a>
      <iframe src="https://evil.example"></iframe><style>body{}</style><svg onload="x()"><circle/></svg>
      <form action="/steal"><input name="p"></form><object data="x.swf"></object>
      <a href="data:text/html;base64,PHNjcmlwdD4=">data</a>`;
    const clean = sanitizeArticleHtml(dirty, 'https://news.example.com/a');
    expect(clean).not.toMatch(/script|onclick|onerror|onload|javascript:|iframe|<style|<svg|<form|<object|data:text/i);
    expect(clean).toContain('<b>world</b>');
    expect(clean).toContain('href="https://news.example.com/ok"');
    expect(clean).toContain('rel="nofollow noopener noreferrer"');
    expect(clean).toContain('src="https://news.example.com/x.png"');
  });

  it('content hash ignores markup and whitespace differences', () => {
    const a = htmlToText('<p>Zepto  raised <b>$25 million</b>.</p>');
    const b = htmlToText('<div>Zepto raised $25 million.</div>');
    expect(contentHash(a)).toBe(contentHash(b));
  });
});

describe('extraction chain', () => {
  it('prefers JSON-LD NewsArticle metadata and extracts clean body text', () => {
    const html = articleHtml({
      lang: 'en',
      headline: 'Zepto raises $25 million',
      paragraphs: LONG_EN,
      canonical: 'https://news.example.com/2026/09/zepto-raises',
      image: 'https://cdn.example.com/zepto.jpg',
      author: 'Jane Doe',
      publisher: 'Example News',
    });
    const x = extractArticle(html, 'https://news.example.com/2026/09/zepto-raises?utm_source=rss', getAdapter(null));
    expect(x.headline).toBe('Zepto raises $25 million');
    expect(x.author).toBe('Jane Doe');
    expect(x.publishedAt?.toISOString()).toBe('2026-09-20T08:00:00.000Z');
    expect(x.canonicalUrl).toBe('https://news.example.com/2026/09/zepto-raises');
    expect(x.leadImage).toBe('https://cdn.example.com/zepto.jpg');
    expect(x.imageCredit).toBe('Photo: Company handout');
    expect(x.bodyText).toContain('Nexus Venture Partners');
    expect(x.bodyText).not.toContain('Copyright');
    expect(x.needsRender).toBe(false);
  });

  it('falls back to OpenGraph + semantic HTML without JSON-LD and flags thin pages for rendering', () => {
    const html = articleHtml({ lang: 'en', headline: 'OG only', paragraphs: LONG_EN, jsonLd: false });
    const x = extractArticle(html, 'https://news.example.com/og', getAdapter(null));
    expect(x.headline).toBe('OG only');
    expect(['readability', 'semantic_html']).toContain(x.method);
    const thin = extractArticle('<html><body><div id="app"></div></body></html>', 'https://news.example.com/spa', getAdapter(null));
    expect(thin.needsRender).toBe(true);
  });

  it('detects paywalls without trying to bypass them', () => {
    const html = articleHtml({ lang: 'en', headline: 'Paid', paragraphs: ['Teaser only. Subscribe to continue reading.'], jsonLd: { isAccessibleForFree: false } });
    const x = extractArticle(html, 'https://news.example.com/paid', getAdapter(null));
    expect(x.isAccessibleForFree).toBe(false);
    expect(detectPaywall(html, x.bodyText, { isAccessibleForFree: x.isAccessibleForFree }).paywalled).toBe(true);
    expect(detectPaywall('<p/>', 'Short teaser. Subscribe to continue reading', { isAccessibleForFree: null }).paywalled).toBe(true);
  });
});

describe('language detection (country/language agnostic)', () => {
  const cases: Array<[string, string]> = [
    ['ja', '東京を拠点とするAIスタートアップのサカナAIは、シリーズAラウンドで30億円の資金調達を実施したと発表した。同社は大規模言語モデルの研究開発を進めている。'],
    ['en', LONG_EN.join(' ')],
    ['de', 'Das Berliner Start-up hat in einer Finanzierungsrunde 20 Millionen Euro eingesammelt und will damit in neue Märkte expandieren.'],
    ['pt', 'A startup brasileira anunciou nesta terça-feira uma rodada de investimento de 50 milhões de reais liderada por um fundo americano.'],
    ['ko', '서울에 본사를 둔 스타트업이 시리즈 B 투자에서 300억 원을 유치했다고 밝혔다. 회사는 해외 시장 진출을 준비하고 있다.'],
  ];
  it.each(cases)('detects %s', (lang, text) => {
    expect(detectLanguage(text).language).toBe(lang);
  });
  it('falls back to markup and then to the source default', () => {
    expect(detectLanguage('短い', { htmlLang: 'ja-JP' }).language).toBe('ja');
    expect(detectLanguage('', { sourceDefault: 'fr' })).toMatchObject({ language: 'fr', method: 'source_default' });
  });
});

describe('cleanAuthor', () => {
  it('drops template keys, URLs, emails and the publisher name', () => {
    expect(cleanAuthor('list.metadata.agency')).toBeNull();
    expect(cleanAuthor('https://www.livemint.com/authors/jane')).toBeNull();
    expect(cleanAuthor('desk@livemint.com')).toBeNull();
    expect(cleanAuthor('{{author}}')).toBeNull();
    expect(cleanAuthor('mint', 'Mint')).toBeNull();
    expect(cleanAuthor('   ')).toBeNull();
  });
  it('keeps real names and strips a "By" prefix', () => {
    expect(cleanAuthor('By Jane Doe')).toBe('Jane Doe');
    expect(cleanAuthor('Aadit Palicha')).toBe('Aadit Palicha');
    expect(cleanAuthor('J.R. Smith')).toBe('J.R. Smith');
  });
});
