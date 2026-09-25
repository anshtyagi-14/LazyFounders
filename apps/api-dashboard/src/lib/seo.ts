import type { Metadata } from 'next';
import { BRAND, FALLBACK_IMAGE_PATH, SITE_URL } from '@/lib/articles';
import { DEFAULT_TWITTER_HANDLE, SOCIAL_PROFILE_LIST } from '@/lib/social';
import { authorPath, type PublicAuthor } from '@/lib/authors';

export { BRAND, FALLBACK_IMAGE_PATH, SITE_URL };

/**
 * Single source of truth for every SEO / AEO / GEO signal the public site emits.
 *
 * SEO  — titles, descriptions, canonicals, Open Graph / Twitter cards, sitemaps.
 * AEO  — schema.org markup that answer engines lift into snippets (FAQPage,
 *        BreadcrumbList, speakable, ItemList).
 * GEO  — entity clarity for generative engines: a stable Organization entity with
 *        sameAs links, explicit attribution, and /llms.txt.
 */

export const SITE_DESCRIPTION =
  process.env.SITE_DESCRIPTION ||
  `${BRAND} tracks Indian startups, funding rounds, AI and product launches — original reporting synthesised from verified sources and published with full citations.`;

export const SITE_TAGLINE = process.env.SITE_TAGLINE || 'Startup, funding and AI news for builders';

export const SITE_LOCALE = process.env.SITE_LOCALE || 'en_IN';
export const SITE_LANG = SITE_LOCALE.split('_')[0] || 'en';

/** Brand logo used by Organization schema and as the social-card fallback. */
export const SITE_LOGO = `${SITE_URL}/logo512.png`;
/**
 * Static 1200x630 brand card: the last step of every image fallback chain
 * (article image, then source image, then this). Also the share image for
 * pages with no artwork of their own.
 */
export const DEFAULT_IMAGE = { path: '/og-default.png', width: 1200, height: 630 } as const;
export const SITE_OG_IMAGE = `${SITE_URL}${DEFAULT_IMAGE.path}`;
/**
 * sameAs profiles: the strongest signal an AI engine has for resolving the brand
 * entity. The env var overrides, but it is unset everywhere, so the default is
 * the real list rather than nothing.
 */
const ENV_SOCIAL_PROFILES = (process.env.SITE_SOCIAL_PROFILES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const SOCIAL_PROFILES = ENV_SOCIAL_PROFILES.length
  ? ENV_SOCIAL_PROFILES
  : SOCIAL_PROFILE_LIST.map((p) => p.href);

export const TWITTER_HANDLE = process.env.SITE_TWITTER_HANDLE || DEFAULT_TWITTER_HANDLE;

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Escape text for an XML text node or attribute.
 *
 * Every XML surface has to run its own values through this. Next's sitemap
 * serialiser interpolates `url` and `images` straight into the document with no
 * escaping of its own, so a third-party image URL carrying a bare `&` (query
 * separators such as `?width=1200&format=jpeg` are routine) produces an
 * `EntityRef` parse error and truncates the sitemap at that line.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Trim to a length search engines actually render, without cutting mid-word. */
export function clamp(text: string, max: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,.;:-]+$/, '')}…`;
}

type PageMetaInput = {
  title: string;
  description: string;
  path: string;
  /** Absolute or site-relative image URL. Falls back to the static brand card. */
  image?: string | null;
  /** Only when actually known: a guessed size is worse than none. */
  imageWidth?: number;
  imageHeight?: number;
  imageAlt?: string;
  type?: 'website' | 'article';
  index?: boolean;
  keywords?: string[];
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  /** Point search engines at a different URL (used for syndicated source stories). */
  canonical?: string;
};

/**
 * Builds a complete, consistent metadata block. Every public page goes through this so
 * titles, canonicals, Open Graph and Twitter tags can never drift apart.
 */
export function pageMetadata(input: PageMetaInput): Metadata {
  const url = absoluteUrl(input.path);
  const title = clamp(input.title, 70);
  const description = clamp(input.description || SITE_DESCRIPTION, 160);
  const image = input.image ? absoluteUrl(input.image) : SITE_OG_IMAGE;
  const size =
    image === SITE_OG_IMAGE
      ? { width: DEFAULT_IMAGE.width, height: DEFAULT_IMAGE.height }
      : input.imageWidth && input.imageHeight
        ? { width: input.imageWidth, height: input.imageHeight }
        : {};
  const index = input.index !== false;

  return {
    title,
    description,
    keywords: input.keywords?.length ? input.keywords : undefined,
    alternates: {
      canonical: input.canonical ?? url,
      // One locale, stated rather than inferred: the copy, the currency and the
      // beat are all Indian English.
      languages: { [SITE_LOCALE.replace('_', '-')]: url },
      types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
    },
    openGraph: {
      type: input.type ?? 'website',
      url,
      title,
      description,
      siteName: BRAND,
      locale: SITE_LOCALE,
      images: [{ url: image, ...size, alt: input.imageAlt || title }],
      ...(input.type === 'article'
        ? { publishedTime: input.publishedTime, modifiedTime: input.modifiedTime, section: input.section, tags: input.keywords }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image, alt: input.imageAlt || title }],
      ...(TWITTER_HANDLE ? { site: TWITTER_HANDLE, creator: TWITTER_HANDLE } : {}),
    },
    robots: index
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } }
      : { index: false, follow: true, googleBot: { index: false, follow: true } },
  };
}

/** Metadata for internal tooling: never indexed, never in the sitemap. */
export function privateMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

// --- schema.org builders ------------------------------------------------------------

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export function organizationSchema() {
  return {
    '@type': 'NewsMediaOrganization',
    '@id': ORGANIZATION_ID,
    name: BRAND,
    alternateName: SITE_TAGLINE,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: { '@type': 'ImageObject', url: SITE_LOGO, width: 512, height: 512 },
    image: SITE_LOGO,
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
    // The trust pages, as schema.org names them for news publishers.
    publishingPrinciples: `${SITE_URL}/editorial-policy`,
    correctionsPolicy: `${SITE_URL}/corrections`,
    ethicsPolicy: `${SITE_URL}/editorial-policy`,
    actionableFeedbackPolicy: `${SITE_URL}/contact`,
  };
}

export function personId(slug: string): string {
  return `${SITE_URL}/author/${slug}#person`;
}

/** A LazyFounders byline, as the Person entity that article JSON-LD points at by @id. */
export function personSchema(author: PublicAuthor) {
  return {
    '@type': 'Person',
    '@id': personId(author.slug),
    name: author.name,
    url: absoluteUrl(authorPath(author.slug)),
    jobTitle: author.jobTitle,
    description: author.bio,
    ...(author.avatarUrl ? { image: absoluteUrl(author.avatarUrl) } : {}),
    ...(author.sameAs.length ? { sameAs: author.sameAs } : {}),
    worksFor: { '@id': ORGANIZATION_ID },
  };
}

export function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: BRAND,
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANG,
    publisher: { '@id': ORGANIZATION_ID },
    // The site has a working reader-facing search at /search, so say so: this is
    // what a sitelinks searchbox and an answer engine's "search this site" both read.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export type ListEntry = { path: string; name: string };

/** ItemList markup: how answer engines read a hub page's contents without guessing. */
export function itemListSchema(entries: ListEntry[]) {
  return {
    '@type': 'ItemList',
    numberOfItems: entries.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: entries.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(e.path),
      name: clamp(e.name, 110),
    })),
  };
}

export function collectionPageSchema(opts: {
  path: string;
  name: string;
  description: string;
  crumbs: Crumb[];
  entries: ListEntry[];
  /** The entity this hub is about, when there is one (a company, a topic). */
  about?: Record<string, unknown>;
}) {
  const url = absoluteUrl(opts.path);
  // The Organization and WebSite nodes are emitted once by the root layout; referencing
  // them by @id here keeps the graph connected without repeating them on every page.
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#webpage`,
        url,
        name: clamp(opts.name, 110),
        description: clamp(opts.description, 300),
        inLanguage: SITE_LANG,
        isPartOf: { '@id': WEBSITE_ID },
        publisher: { '@id': ORGANIZATION_ID },
        breadcrumb: breadcrumbSchema(opts.crumbs),
        mainEntity: itemListSchema(opts.entries),
        ...(opts.about ? { about: opts.about } : {}),
      },
    ],
  };
}

export interface Faq {
  question: string;
  answer: string;
}

/**
 * AEO: pull question-shaped headings and their first substantial answer paragraph out of
 * the body, so they can be emitted as FAQPage markup — the format featured snippets and
 * voice assistants read directly.
 */
export function extractFaq(markdown: string, limit = 8): Faq[] {
  const out: Faq[] = [];
  const sections = markdown.split(/\n(?=#{2,4}\s)/);
  for (const section of sections) {
    const m = /^#{2,4}\s+(.+?)\s*\n([\s\S]*)$/.exec(section);
    if (!m) continue;
    const question = stripMarkdown(m[1]);
    if (!question.endsWith('?')) continue;
    const answer = m[2]
      .split(/\n{2,}/)
      .map((p) => stripMarkdown(p))
      .find((p) => p.length > 40);
    if (!answer) continue;
    out.push({ question: clamp(question, 200), answer: clamp(answer, 600) });
    if (out.length >= limit) break;
  }
  return out;
}

export function faqSchema(faqs: Faq[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** Markdown to plain prose, for schema fields that must not contain markup. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}[*\-+]\s+/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(markdown: string): number {
  return stripMarkdown(markdown).split(/\s+/).filter(Boolean).length;
}

/** Serialises JSON-LD with `<` escaped so it can never break out of the script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
