import { sanitizeHeadline, slugifyCategory } from '@/lib/articles';

/**
 * The six categories the public site is organised around. Everything else —
 * the pipeline's own labels (startup, founders, finance, health, ...) and the
 * long tail of publisher categories on source stories — folds into one of
 * these or is dropped, so the masthead, homepage sections, category pages and
 * sitemap all agree on the same short list.
 *
 * The mapping is display-only: Article.category keeps whatever the pipeline
 * wrote, and the category pages translate back through CATEGORY_ALIASES.
 */

export type CategorySlug = 'funding' | 'ai' | 'policy' | 'technology' | 'business' | 'product';

export interface SiteCategory {
  slug: CategorySlug;
  label: string;
  /** One line under the homepage section heading. */
  blurb: string;
  /** Category-page intro and meta description. */
  description: string;
}

export const SITE_CATEGORIES: readonly SiteCategory[] = [
  {
    slug: 'funding',
    label: 'Funding',
    blurb: 'Rounds, valuations and who wrote the cheque.',
    description: 'Startup funding news: seed to late-stage rounds, valuations, acquisitions and the investors behind them.',
  },
  {
    slug: 'ai',
    label: 'AI',
    blurb: 'Models, infrastructure and the companies betting on both.',
    description: 'Artificial intelligence news: model launches, AI infrastructure, assistants and the startups building on them.',
  },
  {
    slug: 'policy',
    label: 'Policy',
    blurb: 'Regulation, courts and government money.',
    description: 'Tech policy news: regulation, privacy rules, court rulings and government programmes that shape startups.',
  },
  {
    slug: 'technology',
    label: 'Technology',
    blurb: 'Hardware, climate, health, security and deep tech.',
    description: 'Technology news across hardware, climate tech, health tech, security, robotics, space and mobility.',
  },
  {
    slug: 'business',
    label: 'Business',
    blurb: 'Startups, founders, fintech and the market around them.',
    description: 'Startup and business news: launches, pivots, founders, fintech, commerce and the markets they operate in.',
  },
  {
    slug: 'product',
    label: 'Product',
    blurb: 'Apps, launches and what shipped this week.',
    description: 'Product news: app launches, feature releases, consumer platforms and what companies shipped.',
  },
];

const BY_SLUG = new Map<string, SiteCategory>(SITE_CATEGORIES.map((c) => [c.slug, c]));

/** Slugified raw labels (pipeline enum + publisher categories) to a site category. */
const CATEGORY_ALIASES: Record<string, CategorySlug> = {
  // Funding
  funding: 'funding',
  fundraising: 'funding',
  venture: 'funding',
  'venture-capital': 'funding',
  vc: 'funding',
  investors: 'funding',
  'investors-and-funding': 'funding',
  investment: 'funding',
  'mergers-and-acquisitions': 'funding',
  'm-a': 'funding',
  ipo: 'funding',
  // AI
  ai: 'ai',
  'artificial-intelligence': 'ai',
  'machine-learning': 'ai',
  'generative-ai': 'ai',
  genai: 'ai',
  'ai-platforms-assistants': 'ai',
  'ai-platforms-and-assistants': 'ai',
  // Policy
  policy: 'policy',
  'government-policy': 'policy',
  government: 'policy',
  regulation: 'policy',
  legal: 'policy',
  privacy: 'policy',
  'privacy-security': 'policy',
  // Technology
  technology: 'technology',
  tech: 'technology',
  hardware: 'technology',
  gadgets: 'technology',
  robotics: 'technology',
  space: 'technology',
  security: 'technology',
  cybersecurity: 'technology',
  climate: 'technology',
  'climate-tech': 'technology',
  energy: 'technology',
  health: 'technology',
  healthtech: 'technology',
  biotech: 'technology',
  'biotech-health': 'technology',
  transportation: 'technology',
  mobility: 'technology',
  'deep-tech': 'technology',
  semiconductors: 'technology',
  // Business
  business: 'business',
  startup: 'business',
  startups: 'business',
  'startup-stories': 'business',
  founders: 'business',
  finance: 'business',
  fintech: 'business',
  commerce: 'business',
  ecommerce: 'business',
  'e-commerce': 'business',
  enterprise: 'business',
  economy: 'business',
  markets: 'business',
  // Product
  product: 'product',
  products: 'product',
  apps: 'product',
  'product-launches': 'product',
  launches: 'product',
  saas: 'product',
  social: 'product',
  'social-media': 'product',
  'consumer-tech': 'product',
};

/**
 * Labels that carry no subject: publisher section names and internal tags.
 * They are dropped rather than guessed into a category.
 */
const NON_TOPICS = new Set(['news', 'tc', 'uncategorized', 'other', 'general', 'in-depth', 'exclusive', 'featured', 'latest']);

export function getCategory(slug: string): SiteCategory | undefined {
  return BY_SLUG.get(slug);
}

/** The site category a raw label belongs to, or null when it is not a subject we file under. */
export function categoryForLabel(raw: string | null | undefined): SiteCategory | null {
  const clean = sanitizeHeadline(raw);
  if (!clean) return null;
  const slug = slugifyCategory(clean);
  if (!slug || NON_TOPICS.has(slug)) return null;
  const target = CATEGORY_ALIASES[slug];
  return target ? BY_SLUG.get(target)! : null;
}

/**
 * Category for one of our own articles. The pipeline always writes a subject,
 * so an unmapped legacy value lands in Technology rather than nowhere.
 */
export function categoryForArticle(raw: string | null | undefined): SiteCategory {
  return categoryForLabel(raw) ?? BY_SLUG.get('technology')!;
}

/**
 * Where a /news/category/[slug] request belongs: the slug itself when it is a
 * site category, the category it folds into when it is an alias (the page
 * redirects there), or null (404).
 */
export function resolveCategorySlug(requested: string): SiteCategory | null {
  return BY_SLUG.get(requested) ?? categoryForLabel(requested);
}

/** Which of the given raw labels file under `slug`. Used to translate a category page back into a DB filter. */
export function labelsForCategory(slug: CategorySlug, rawLabels: Iterable<string>): string[] {
  const out: string[] = [];
  for (const raw of rawLabels) if (categoryForLabel(raw)?.slug === slug) out.push(raw);
  return out;
}

/** Decode entities, fold into a site category, and drop labels that are not subjects. Returns the category label. */
export function normalizeTopic(raw: string | null | undefined): string | null {
  return categoryForLabel(raw)?.label ?? null;
}

/** Normalise a list of raw labels, de-duplicated, order preserved. */
export function normalizeTopics(raws: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const topic = normalizeTopic(raw);
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    out.push(topic);
  }
  return out;
}

export type SectionLayout = 'lead-and-list' | 'grid';

export interface TopicSectionSpec {
  /** A CategorySlug. */
  slug: string;
  label: string;
  blurb: string;
  take: number;
  layout: SectionLayout;
}

/** Homepage running order: the six categories, in the order the masthead lists them. */
export const HOMEPAGE_SECTIONS: TopicSectionSpec[] = SITE_CATEGORIES.map((c, i) => ({
  slug: c.slug,
  label: c.label,
  blurb: c.blurb,
  take: 4,
  layout: i < 2 ? 'lead-and-list' : 'grid',
}));
