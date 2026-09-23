import { describe, expect, it } from 'vitest';
import { SsrfError } from '../errors';
import { isAllowedByPolicy, parseRobots } from '../net/robots';
import { SafeFetcher, isPublicAddress } from '../net/safe-fetch';
import { canonicalizeUrl, urlFingerprint } from '../net/url-canonical';
import { DomainAllowlist } from '../registry/allowlist';
import { fakeResolver, fakeTransport } from './helpers';

const allow = (host: string) => ['news.example.com', 'cdn.example.com'].includes(host);

describe('URL identity', () => {
  // Required test 5
  it('redirects, tracking params, www/amp variants resolve to one canonical identity', async () => {
    const variants = [
      'http://www.news.example.com/2026/09/story/?utm_source=twitter&utm_medium=social',
      'https://news.example.com/2026/09/story',
      'https://amp.news.example.com/2026/09/story/amp/',
      'https://NEWS.example.com:443/2026/09/story#comments',
      'https://news.example.com/2026/09/story?fbclid=abc',
    ];
    const fps = new Set(variants.map(urlFingerprint));
    expect(fps.size).toBe(1);
    expect(canonicalizeUrl(variants[0])).toBe('https://news.example.com/2026/09/story');
    // Meaningful query params are kept and ordered.
    expect(canonicalizeUrl('https://news.example.com/a?b=2&a=1')).toBe('https://news.example.com/a?a=1&b=2');

    // A redirect chain ends on the same identity as the canonical URL.
    const transport = fakeTransport({
      'https://news.example.com/s/abc123': { status: 301, headers: { location: 'http://news.example.com/2026/09/story/?utm_campaign=x' } },
      'http://news.example.com/2026/09/story/?utm_campaign=x': { status: 302, headers: { location: 'https://news.example.com/2026/09/story' } },
      'https://news.example.com/2026/09/story': { body: '<html></html>', headers: { 'content-type': 'text/html' } },
    });
    const f = new SafeFetcher({ hostPolicy: allow, resolver: fakeResolver(), transport });
    const res = await f.fetch({ url: 'https://news.example.com/s/abc123' });
    expect(res.redirects).toHaveLength(2);
    expect(urlFingerprint(res.finalUrl)).toBe([...fps][0]);
  });
});

describe('SSRF protection', () => {
  // Required test 20
  it('blocks private, loopback, link-local, metadata and mapped addresses', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '224.0.0.1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
  });

  it('refuses hosts resolving to internal addresses (incl. DNS rebinding with mixed records)', async () => {
    const transport = fakeTransport({});
    const mk = (records: string[]) =>
      new SafeFetcher({ hostPolicy: allow, resolver: fakeResolver({ 'news.example.com': records }), transport });
    await expect(mk(['10.0.0.5']).fetch({ url: 'https://news.example.com/x' })).rejects.toBeInstanceOf(SsrfError);
    await expect(mk(['169.254.169.254']).fetch({ url: 'https://news.example.com/x' })).rejects.toBeInstanceOf(SsrfError);
    await expect(mk(['93.184.216.34', '127.0.0.1']).fetch({ url: 'https://news.example.com/x' })).rejects.toBeInstanceOf(SsrfError);
    expect(transport.calls).toHaveLength(0);
  });

  it('refuses IP literals, other schemes, odd ports, credentials and unapproved domains', async () => {
    const f = new SafeFetcher({ hostPolicy: allow, resolver: fakeResolver(), transport: fakeTransport({}) });
    for (const url of [
      'http://127.0.0.1/admin',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'gopher://news.example.com/',
      'https://news.example.com:8443/',
      'https://user:pass@news.example.com/',
      'https://evil.example.org/',
    ]) {
      await expect(f.fetch({ url }), url).rejects.toBeInstanceOf(SsrfError);
    }
  });

  it('re-validates every redirect hop', async () => {
    const transport = fakeTransport({
      'https://news.example.com/go': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
      'https://news.example.com/go2': { status: 302, headers: { location: 'https://internal.example.com/' } },
    });
    const f = new SafeFetcher({ hostPolicy: allow, resolver: fakeResolver(), transport });
    await expect(f.fetch({ url: 'https://news.example.com/go' })).rejects.toBeInstanceOf(SsrfError);
    await expect(f.fetch({ url: 'https://news.example.com/go2' })).rejects.toBeInstanceOf(SsrfError);
  });

  it('caps response size', async () => {
    const f = new SafeFetcher({
      hostPolicy: allow,
      resolver: fakeResolver(),
      transport: fakeTransport({ 'https://news.example.com/big': { body: Buffer.alloc(2048, 97) } }),
      maxBytes: 1024,
    });
    await expect(f.fetch({ url: 'https://news.example.com/big' })).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('allowlist only approves hosts of APPROVED, enabled sources', async () => {
    const list = DomainAllowlist.fromList([
      { domain: 'yourstory.com', kind: 'primary', sourceId: 'ys', approved: true },
      { domain: 'pending.example', kind: 'primary', sourceId: 'p', approved: false },
    ]);
    expect(await list.isAllowed('images.yourstory.com')).toBe(true);
    expect(await list.isAllowed('notyourstory.com')).toBe(false);
    expect(await list.isAllowed('pending.example')).toBe(false);
    expect(await list.forSource('ys')('yourstory.com')).toBe(true);
    expect(await list.forSource('other')('yourstory.com')).toBe(false);
  });
});

describe('robots.txt', () => {
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /private', 'Allow: /private/public', 'Crawl-delay: 5', '', 'User-agent: LazyFoundersBot', 'Disallow: /no-bots$', 'Sitemap: https://x.com/s.xml'].join('\n'),
    'LazyFoundersBot/1.0',
  );
  it('uses the most specific group and longest match', () => {
    expect(rules.disallow).toEqual(['/no-bots$']);
    const star = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 5', 'OtherBot');
    expect(isAllowedByPolicy({ status: 'parsed', rules: star }, 'https://x.com/private/a', true)).toBe(false);
    expect(isAllowedByPolicy({ status: 'parsed', rules: star }, 'https://x.com/private/public/a', true)).toBe(true);
    expect(star.crawlDelaySeconds).toBe(5);
  });
  it('fails closed when robots.txt is unreachable and the source requires it', () => {
    expect(isAllowedByPolicy({ status: 'unreachable', rules: rules }, 'https://x.com/a', true)).toBe(false);
    expect(isAllowedByPolicy({ status: 'none', rules: rules }, 'https://x.com/a', true)).toBe(true);
  });
});
