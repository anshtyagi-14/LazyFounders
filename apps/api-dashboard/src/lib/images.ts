import { DEFAULT_IMAGE, FALLBACK_IMAGE_PATH, OWNED_IMAGE_RIGHTS, absoluteUrl } from '@/lib/seo';

/**
 * One image decision per story, shared by the hero, og:image, twitter:image and
 * NewsArticle.image so they can never disagree.
 *
 * Order: the story's own image (the scraped lead image the pipeline attached,
 * already filtered by the source's image policy) → another cited source's lead
 * image → the static brand card.
 */

export interface ImageCandidate {
  url: string | null | undefined;
  credit?: string | null;
  /** Page the image is credited to (the source article). */
  creditUrl?: string | null;
}

export interface ResolvedImage {
  /** Absolute URL, safe for og:image. */
  url: string;
  /** What to put in <img src>: the lightweight brand fallback for the card/hero case. */
  displayUrl: string;
  /** Only set when known — the brand card. Remote image sizes are not stored. */
  width?: number;
  height?: number;
  alt: string;
  credit: string | null;
  creditUrl: string | null;
  isFallback: boolean;
}

/**
 * An image URL we are willing to hotlink: absolute https, or a path on this
 * site. Plain http would be blocked as mixed content (and by the CSP's
 * upgrade-insecure-requests on hosts without TLS); data: and javascript: are
 * never article images.
 */
export function usableImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && parsed.hostname.includes('.') ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function resolveImage(candidates: ImageCandidate[], alt: string): ResolvedImage {
  for (const c of candidates) {
    const url = usableImageUrl(c.url);
    if (!url) continue;
    return {
      url: absoluteUrl(url),
      displayUrl: url,
      alt,
      credit: c.credit ?? null,
      creditUrl: c.creditUrl ?? null,
      isFallback: false,
    };
  }
  return {
    url: absoluteUrl(DEFAULT_IMAGE.path),
    displayUrl: FALLBACK_IMAGE_PATH,
    width: DEFAULT_IMAGE.width,
    height: DEFAULT_IMAGE.height,
    // The brand card carries no information a screen reader needs.
    alt: '',
    credit: null,
    creditUrl: null,
    isFallback: true,
  };
}

/**
 * The story image as a schema.org ImageObject with Google's Image Metadata fields.
 *
 * Our brand card gets our full rights set. A publisher's image is credited to that
 * publisher, with the original story as the place to ask about licensing; it gets no
 * `license`, because we do not know the publisher's terms and must not invent them.
 */
export function imageObjectSchema(image: ResolvedImage, caption: string): Record<string, unknown> {
  const base = {
    '@type': 'ImageObject',
    url: image.url,
    contentUrl: image.url,
    ...(image.width && image.height ? { width: image.width, height: image.height } : {}),
  };
  if (image.isFallback) return { ...base, ...OWNED_IMAGE_RIGHTS };

  const origin = safeOrigin(image.creditUrl);
  const owner = image.credit?.trim() || (origin ? new URL(origin).hostname.replace(/^www\./, '') : null);
  return {
    ...base,
    caption,
    ...(owner
      ? {
          creator: { '@type': 'Organization', name: owner, ...(origin ? { url: origin } : {}) },
          creditText: owner,
          copyrightNotice: `© ${owner}`,
        }
      : {}),
    ...(image.creditUrl && origin ? { acquireLicensePage: image.creditUrl } : {}),
  };
}

function safeOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}
