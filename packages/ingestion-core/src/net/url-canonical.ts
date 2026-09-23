import { createHash } from 'node:crypto';

/** Query parameters that never change which article a URL points to. */
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'twclid', 'ttclid', 'igshid', 'li_fat_id',
  'mc_cid', 'mc_eid', '_ga', '_gl', '_hsenc', '_hsmi', 'yclid', 'ref_src', 'ref_url', 'cmpid',
  'amp', 'outputType', 'utm', 'spm', 'share', 'from', 'ncid', 'sr_share',
]);

/**
 * Canonical form used as the identity of an article URL:
 * https, lowercase host without "www." and "amp." prefixes, no default port, no fragment,
 * tracking params removed, remaining params sorted, "/amp" suffix and trailing slash removed.
 */
export function canonicalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Unsupported scheme: ${url.protocol}`);
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^(www|amp|m)\./, '').replace(/\.$/, '');
  url.port = '';
  url.hash = '';
  url.username = '';
  url.password = '';

  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);

  let path = url.pathname.replace(/\/{2,}/g, '/');
  path = path.replace(/\/amp\/?$/i, '/').replace(/\.amp(\.html)?$/i, '$1');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  url.pathname = path;
  return url.toString();
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Stable identity of a URL: sha256 of its canonical form. */
export function urlFingerprint(input: string): string {
  return sha256(canonicalizeUrl(input));
}

/** Registrable-ish host used for allowlist matching (lowercase, no www). */
export function hostOf(input: string): string {
  return new URL(input).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}
