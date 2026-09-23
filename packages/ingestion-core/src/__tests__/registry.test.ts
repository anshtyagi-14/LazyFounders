import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAdapter, registerAdapter } from '../registry/adapters';
import { SourceConfigError, loadSourceConfigs, parseSourceConfig } from '../registry/source-config';

const base = `key: example
name: Example
country: JP
defaultLanguage: ja
domains:
  primary: example.jp
discovery:
  methods: [rss]
  feeds: [https://example.jp/feed]
`;

describe('Trusted Source Registry', () => {
  it('validates the shipped global catalogue (no duplicate keys or domains)', () => {
    const configs = loadSourceConfigs(resolve(__dirname, '../../../../sources'));
    expect(configs.length).toBeGreaterThanOrEqual(20);
    const countries = new Set(configs.map((c) => c.config.country));
    const languages = new Set(configs.map((c) => c.config.defaultLanguage));
    expect(countries.size).toBeGreaterThanOrEqual(10);
    expect(languages).toEqual(expect.objectContaining({ size: expect.any(Number) }));
    expect([...languages]).toEqual(expect.arrayContaining(['en', 'ja', 'de', 'fr', 'es', 'pt', 'zh', 'ko']));
    // Nothing is trusted by default: every starter source needs editor approval.
    expect(configs.every((c) => c.config.trustStatus === 'PENDING' && !c.config.active)).toBe(true);
    // Every adapter referenced by config exists.
    for (const c of configs) expect(() => getAdapter(c.config.adapter)).not.toThrow();
  });

  it('applies safe defaults (manual publishing, robots required, no rendering)', () => {
    const { config } = parseSourceConfig(base);
    expect(config).toMatchObject({
      trustStatus: 'PENDING',
      active: false,
      fetch: { renderPolicy: 'never', robotsRequired: true },
      publishing: { mode: 'MANUAL' },
      translation: { mode: 'if_different' },
      imagePolicy: 'link_with_credit',
    });
  });

  it('rejects unsafe or inconsistent configs', () => {
    const bad = (yaml: string) => () => parseSourceConfig(yaml);
    expect(bad(base.replace('https://example.jp/feed', 'https://evil.example.com/feed'))).toThrow(/not on an approved domain/);
    expect(bad(`${base}active: true\n`)).toThrow(/only APPROVED sources may be active/);
    expect(bad(base.replace('country: JP', 'country: Japan'))).toThrow(SourceConfigError);
    expect(bad(base.replace('primary: example.jp', 'primary: https://example.jp'))).toThrow(SourceConfigError);
    expect(bad(base.replace('methods: [rss]', 'methods: [sitemap]'))).toThrow(/requires discovery.sitemaps/);
    expect(bad(`${base}trustStatus: APPROVED\npaywall: hard\npublishing:\n  mode: AUTO\n`)).toThrow(/cannot auto-publish/);
  });

  it('new publishers plug in through adapters without touching the pipeline', () => {
    registerAdapter({ key: 'custom-test', isArticleUrl: (u) => u.pathname.startsWith('/news/') });
    const a = getAdapter('custom-test');
    expect(a.isArticleUrl?.(new URL('https://x.com/news/a'))).toBe(true);
    expect(a.isArticleUrl?.(new URL('https://x.com/tag/a'))).toBe(false);
    expect(() => getAdapter('does-not-exist')).toThrow(/Unknown source adapter/);
  });
});
