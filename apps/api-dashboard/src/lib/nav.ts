import { SITE_CATEGORIES } from '@/lib/topics';
import { SOCIAL_PROFILE_LIST } from '@/lib/social';

/**
 * Navigation for the masthead and the footer. Fixed lists, no database reads:
 * the header renders on every page, and a curated set of six categories is
 * what the reader should see rather than whatever labels the data produced.
 */

export interface NavLink {
  label: string;
  href: string;
}

/** Masthead category links. Product is a homepage section but stays out of the bar to keep it short. */
export const HEADER_CATEGORY_LINKS: NavLink[] = SITE_CATEGORIES.filter((c) => c.slug !== 'product').map((c) => ({
  label: c.label,
  href: `/news/category/${c.slug}`,
}));

export const CATEGORY_LINKS: NavLink[] = SITE_CATEGORIES.map((c) => ({ label: c.label, href: `/news/category/${c.slug}` }));

/** The trust pages, in the order a reader looks for them. */
export const TRUST_LINKS: NavLink[] = [
  { label: 'About', href: '/about' },
  { label: 'Authors', href: '/authors' },
  { label: 'Contact', href: '/contact' },
  { label: 'Editorial Policy', href: '/editorial-policy' },
  { label: 'AI Policy', href: '/ai-policy' },
  { label: 'Corrections', href: '/corrections' },
  { label: 'Disclaimer', href: '/disclaimer' },
  { label: 'Terms', href: '/terms' },
];

/** Footer "Follow" column: RSS plus the profiles readers asked for. */
export const FOLLOW_LINKS: (NavLink & { event: 'rss_select' | 'social_profile_select'; external: boolean })[] = [
  { label: 'RSS', href: '/feed.xml', event: 'rss_select', external: false },
  ...SOCIAL_PROFILE_LIST.filter((p) => p.label === 'Instagram' || p.label === 'LinkedIn').map((p) => ({
    ...p,
    event: 'social_profile_select' as const,
    external: true,
  })),
];
