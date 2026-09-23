import { sanitizeHeadline, slugifyCategory } from '@/lib/articles';

/**
 * Topics are the spine of the site: the masthead dropdown, the homepage section
 * order and the footer column all read from here.
 *
 * They have to be normalised because the two content pools label things
 * differently and neither is clean. Published LazyFounders stories carry a single
 * free-text `Article.category`; stored source stories carry a `String[]` of
 * publisher categories, some of which still hold raw HTML entities
 * ("Biotech &amp; Health") and some of which are publisher bookkeeping rather
 * than a subject ("TC", "News").
 */

/** Publisher labels that mean the same beat, folded into one topic. */
const TOPIC_ALIASES: Record<string, string> = {
  fundraising: 'Funding',
  venture: 'Funding',
  'venture-capital': 'Funding',
  funding: 'Funding',
  startups: 'Startups',
  'startup-stories': 'Startups',
  'biotech-health': 'Biotech',
  biotech: 'Biotech',
  'government-policy': 'Policy',
  policy: 'Policy',
  ai: 'AI',
  'artificial-intelligence': 'AI',
  fintech: 'Fintech',
  climate: 'Climate',
  apps: 'Apps',
  hardware: 'Hardware',
  robotics: 'Robotics',
  gadgets: 'Gadgets',
  security: 'Security',
  space: 'Space',
  commerce: 'Commerce',
  social: 'Social',
  transportation: 'Mobility',
  mobility: 'Mobility',
};

/**
 * Labels that carry no subject: publisher section names and internal tags.
 * They are dropped rather than shown as a topic nobody can browse meaningfully.
 */
const NON_TOPICS = new Set(['news', 'tc', 'uncategorized', 'other', 'general', 'in-depth', 'exclusive']);

/** Decode entities, fold aliases, and drop the labels that are not subjects. */
export function normalizeTopic(raw: string | null | undefined): string | null {
  const clean = sanitizeHeadline(raw);
  if (!clean) return null;
  const slug = slugifyCategory(clean);
  if (!slug || NON_TOPICS.has(slug)) return null;
  return TOPIC_ALIASES[slug] ?? clean;
}

/** Normalise a list of raw labels, de-duplicated, order preserved. */
export function normalizeTopics(raws: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const topic = normalizeTopic(raw);
    if (!topic) continue;
    const slug = slugifyCategory(topic);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(topic);
  }
  return out;
}

export type SectionLayout = 'lead-and-list' | 'grid';

export interface TopicSectionSpec {
  /** Matches a normalised topic through slugifyCategory(). */
  slug: string;
  label: string;
  /** One line under the heading. Written per beat, not generated. */
  blurb: string;
  take: number;
  layout: SectionLayout;
}

/**
 * The editorial running order of the homepage. Sections with no stories render
 * nothing, so this list can safely name a beat the pipeline has not filled yet.
 * Topics found in the data but missing here are appended after these, so a new
 * beat is never invisible.
 */
export const HOMEPAGE_SECTIONS: TopicSectionSpec[] = [
  {
    slug: 'funding',
    label: 'Funding',
    blurb: 'Rounds, valuations and who wrote the cheque.',
    take: 5,
    layout: 'lead-and-list',
  },
  {
    slug: 'ai',
    label: 'AI',
    blurb: 'Models, infrastructure and the companies betting on both.',
    take: 5,
    layout: 'lead-and-list',
  },
  {
    slug: 'startups',
    label: 'Startups',
    blurb: 'Launches, pivots and the operators behind them.',
    take: 4,
    layout: 'grid',
  },
  {
    slug: 'fintech',
    label: 'Fintech',
    blurb: 'Payments, lending and the regulation shaping both.',
    take: 4,
    layout: 'grid',
  },
  {
    slug: 'climate',
    label: 'Climate',
    blurb: 'Energy, mobility and the capital moving into them.',
    take: 4,
    layout: 'grid',
  },
  {
    slug: 'policy',
    label: 'Policy',
    blurb: 'Regulation, courts and government money.',
    take: 4,
    layout: 'grid',
  },
  {
    slug: 'hardware',
    label: 'Hardware',
    blurb: 'Silicon, devices and the factories behind them.',
    take: 4,
    layout: 'grid',
  },
  {
    slug: 'robotics',
    label: 'Robotics',
    blurb: 'Automation moving out of the demo video.',
    take: 4,
    layout: 'grid',
  },
];

/** Section specs for topics present in the data but absent from the curated list. */
export function fallbackSection(label: string): TopicSectionSpec {
  return {
    slug: slugifyCategory(label),
    label,
    blurb: 'Latest ' + label + ' coverage.',
    take: 4,
    layout: 'grid',
  };
}
