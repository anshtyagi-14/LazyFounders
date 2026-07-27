import { UrlNormalizer } from '../../src/filter/url-normalizer';

describe('UrlNormalizer', () => {
  let normalizer: UrlNormalizer;

  beforeEach(() => {
    normalizer = new UrlNormalizer();
  });

  it('adds https to URLs without protocol', () => {
    const url = 'example.com/page';
    expect(normalizer.normalize(url)).toMatch(/^https:\/\//);
  });

  it('removes utm_source and utm_campaign query parameters', () => {
    const url = 'https://example.com/page?utm_source=test&utm_campaign=test&valid=1';
    const normalized = normalizer.normalize(url);
    expect(normalized).not.toContain('utm_source');
    expect(normalized).not.toContain('utm_campaign');
    expect(normalized).toContain('valid=1');
  });

  it('lowers hostname but not path', () => {
    const url = 'https://Example.COM/Page';
    const normalized = normalizer.normalize(url);
    expect(normalized).toContain('https://example.com');
    expect(normalized).toContain('/Page');
  });

  it('removes trailing slash', () => {
    const url = 'https://example.com/page/';
    const normalized = normalizer.normalize(url);
    expect(normalized.endsWith('/')).toBe(false);
  });
});
