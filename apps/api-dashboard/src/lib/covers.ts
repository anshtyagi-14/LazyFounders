/**
 * Every story is illustrated by cover cards we render ourselves (see
 * app/covers/[file]/route.tsx), never by the publisher's photo: those are not
 * ours to reuse and often carry the publisher's logo.
 *
 * Two variants of the same card:
 * - "social"  /covers/<slug>.png      headline on the card, for og:image, JSON-LD, sitemaps, RSS
 * - "art"     /covers/<slug>.art.png  no headline, for on-site cards and heroes, where the
 *                                     page already prints the headline next to the image
 *
 * Paths only, no imports: articles.ts uses this, and seo.ts imports articles.ts.
 */

export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;

export type CoverVariant = 'social' | 'art';

const COVER_FILE_RE = /^([a-z0-9][a-z0-9-]{0,199})(\.art)?\.png$/i;

export function coverPath(slug: string, variant: CoverVariant = 'social'): string {
  return `/covers/${slug}${variant === 'art' ? '.art' : ''}.png`;
}

/**
 * Bumped whenever the social card's design changes. Facebook, LinkedIn and WhatsApp
 * cache a preview by image URL, so a new query string is what makes them fetch the new card.
 */
export const COVER_VERSION = 2;

/** The social card as og:image / twitter:image reference it: versioned for scraper caches. */
export function shareCoverPath(slug: string): string {
  return `${coverPath(slug, 'social')}?v=${COVER_VERSION}`;
}

/** The cover for a story URL such as /news/<slug> (ours or syndicated). */
export function coverPathForStoryUrl(storyUrl: string, variant: CoverVariant = 'social'): string {
  return coverPath(storySlug(storyUrl), variant);
}

/** The slug of a story URL such as /news/<slug>. */
export function storySlug(storyUrl: string): string {
  return storyUrl.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '';
}

/** What a /covers/<file> request asks for, or null when it is not a cover file name. */
export function parseCoverFile(file: string): { slug: string; variant: CoverVariant } | null {
  const m = COVER_FILE_RE.exec(file);
  return m ? { slug: m[1].toLowerCase(), variant: m[2] ? 'art' : 'social' } : null;
}
