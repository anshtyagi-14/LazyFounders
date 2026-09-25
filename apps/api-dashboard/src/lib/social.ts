/**
 * The brand's own profiles, in one place.
 *
 * These are the `sameAs` links in the Organization schema, which is the
 * strongest signal a search or answer engine has for resolving "LazyFounders"
 * to an entity rather than a string. They used to be readable only from
 * SITE_SOCIAL_PROFILES, which is unset in every environment, so the site
 * emitted no sameAs at all while the footer linked all three.
 *
 * They live here rather than in nav.ts because nav.ts imports Prisma, and
 * seo.ts is loaded by the OG image route and the sitemaps, which must not drag
 * a database client in behind them.
 */

export interface SocialProfile {
  label: string;
  href: string;
}

export const SOCIAL_PROFILE_LIST: SocialProfile[] = [
  { label: 'X', href: 'https://x.com/lazyfounders' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/lazyfounders' },
  { label: 'Instagram', href: 'https://www.instagram.com/lazyfounders.in/' },
];

/** The handle Twitter cards attribute to, derived from the X profile above. */
export const DEFAULT_TWITTER_HANDLE = '@lazyfounders';
