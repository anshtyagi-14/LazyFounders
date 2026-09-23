import type { CheerioAPI } from 'cheerio';

export interface AdapterExtraction {
  headline?: string | null;
  subheadline?: string | null;
  author?: string | null;
  bodyHtml?: string | null;
  leadImage?: string | null;
  imageCredit?: string | null;
  categories?: string[];
  tags?: string[];
  publishedAt?: string | null;
  modifiedAt?: string | null;
}

/**
 * Optional per-publisher customisation. The generic chain (JSON-LD -> OpenGraph ->
 * semantic HTML/Readability) runs for every source; an adapter only fills or overrides
 * what the generic chain gets wrong for that publisher. Adding a publisher never
 * requires touching the pipeline: write a YAML file, and an adapter only if needed.
 */
export interface SourceAdapter {
  key: string;
  /** Keep only article URLs from sitemaps/feeds (e.g. drop tag/author pages). */
  isArticleUrl?(url: URL): boolean;
  extract?($: CheerioAPI, url: string): AdapterExtraction;
  /** CSS selectors whose presence marks a paywalled/teaser page. */
  paywallSelectors?: string[];
}

const NON_ARTICLE =
  /\/(tag|tags|category|categories|author|authors|topic|topics|page|search|video|videos|podcast|podcasts|events?|jobs?|about|contact|privacy|terms|feed)(\/|$)/i;

export const genericAdapter: SourceAdapter = {
  key: 'generic',
  isArticleUrl: (url) =>
    url.pathname.length > 1 && !NON_ARTICLE.test(url.pathname) && !/\.(jpe?g|png|gif|webp|svg|pdf|mp4|xml|gz)$/i.test(url.pathname),
};

/** YourStory (IN, en). Article URLs look like /2026/09/<slug> or /<vertical>/<slug>. */
const yourstoryAdapter: SourceAdapter = {
  key: 'yourstory',
  isArticleUrl: (url) =>
    /^\/(\d{4}\/\d{2}\/[^/]+|[a-z-]+\/[a-z0-9-]{12,})\/?$/i.test(url.pathname) &&
    !/^\/(tag|author|category|companies|people)\//i.test(url.pathname),
  extract: ($) => {
    const body = $('[data-testid="article-body"], article [class*="article-body"], article .story-content').first();
    return body.length ? { bodyHtml: body.html() } : {};
  },
  paywallSelectors: ['[class*="paywall"]', '.premium-lock'],
};

/** THE BRIDGE (JP, ja). WordPress-style permalinks. */
const thebridgeAdapter: SourceAdapter = {
  key: 'thebridge',
  isArticleUrl: (url) => /^\/(\d{4}\/\d{2}\/[^/]+|[^/]+-\d+)\/?$/i.test(url.pathname) && !/^\/(tag|category|author)\//.test(url.pathname),
  extract: ($) => {
    const body = $('.entry-content, article .post-content').first();
    return body.length ? { bodyHtml: body.html() } : {};
  },
  paywallSelectors: ['.members-only', '.paywall'],
};

const registry = new Map<string, SourceAdapter>([
  [genericAdapter.key, genericAdapter],
  [yourstoryAdapter.key, yourstoryAdapter],
  [thebridgeAdapter.key, thebridgeAdapter],
]);

/** Register an additional adapter at startup. */
export function registerAdapter(adapter: SourceAdapter): void {
  registry.set(adapter.key, adapter);
}

export function getAdapter(key: string | null | undefined): SourceAdapter {
  if (!key) return genericAdapter;
  const a = registry.get(key);
  if (!a) throw new Error(`Unknown source adapter "${key}"`);
  return { ...genericAdapter, ...a };
}

export function adapterKeys(): string[] {
  return [...registry.keys()];
}
