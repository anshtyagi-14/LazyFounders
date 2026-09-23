import type { Extraction } from '@lazyfounders/llm';
import { normalizeEntity, normalizeForCompare } from '../dedup/similarity';
import { buildEventKey } from '../dedup/decide';
import { sha256 } from '../net/url-canonical';
import { sameNumber, valueSet } from '../validate/numbers';

/** Facts of one source article, expressed in the publishing language where translated. */
export interface SourceFacts {
  sourceArticleId: string;
  publisher: string;
  url: string;
  language: string;
  translated: boolean;
  headline: string;
  summary: string;
  keyFacts: string[];
  extraction: Extraction;
  claims: Array<{ text: string; originalText: string; kind: 'fact' | 'quote'; evidence: string; confidence: number; speaker: string | null }>;
}

export interface StoryFacts {
  storyType: string;
  category: string;
  summary: string;
  companies: Extraction['companies'];
  people: Extraction['people'];
  investors: string[];
  products: string[];
  industries: string[];
  locations: string[];
  topics: string[];
  funding: Extraction['funding'];
  deal: Extraction['deal'];
  eventDate: string | null;
  keyFacts: string[];
  sourceArticleIds: string[];
}

export function toSourceFacts(
  sa: { id: string; publisher: string; url: string; language: string; headline: string | null },
  extraction: Extraction,
  translation: { headline: string | null; summary: string | null; keyFacts: string[]; claims: Array<{ index: number; text: string }> } | null,
): SourceFacts {
  return {
    sourceArticleId: sa.id,
    publisher: sa.publisher,
    url: sa.url,
    language: sa.language,
    translated: Boolean(translation),
    headline: translation?.headline ?? sa.headline ?? extraction.summary,
    summary: translation?.summary ?? extraction.summary,
    keyFacts: translation?.keyFacts ?? extraction.keyFacts,
    extraction,
    claims: extraction.claims.map((c, i) => ({
      text: translation?.claims.find((t) => t.index === i)?.text ?? c.text,
      originalText: c.text,
      kind: c.kind,
      evidence: c.evidence,
      confidence: c.confidence,
      speaker: c.speaker,
    })),
  };
}

export function primaryEntity(x: Extraction): string | null {
  return x.companies.find((c) => c.role === 'subject')?.name ?? x.companies.find((c) => c.role === 'acquirer')?.name ?? x.companies[0]?.name ?? null;
}

export function eventKeyFor(x: Extraction): string | null {
  return buildEventKey({
    storyType: x.storyType,
    primaryEntity: primaryEntity(x),
    amount: x.funding?.amount ?? x.deal?.value ?? null,
    currency: x.funding?.currency ?? x.deal?.currency ?? null,
  });
}

export function entitiesOf(x: Extraction): string[] {
  return [...x.companies.map((c) => c.name), ...x.investors, ...x.people.map((p) => p.name)];
}

export function claimKey(text: string): string {
  return sha256(normalizeForCompare(text)).slice(0, 32);
}

const uniqBy = <T>(items: T[], key: (t: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Fold a new source's facts into a story. Existing values win; gaps are filled; lists are unioned. */
export function mergeStoryFacts(current: StoryFacts | null, src: SourceFacts): StoryFacts {
  const x = src.extraction;
  if (!current) {
    return {
      storyType: x.storyType,
      category: x.category,
      summary: src.summary,
      companies: x.companies,
      people: x.people,
      investors: x.investors,
      products: x.products,
      industries: x.industries,
      locations: x.locations,
      topics: x.topics,
      funding: x.funding,
      deal: x.deal,
      eventDate: x.eventDate,
      keyFacts: src.keyFacts,
      sourceArticleIds: [src.sourceArticleId],
    };
  }
  const fillFunding = (a: Extraction['funding'], b: Extraction['funding']): Extraction['funding'] => {
    if (!a) return b;
    if (!b) return a;
    return {
      amount: a.amount ?? b.amount,
      currency: a.amount != null ? a.currency : b.currency,
      amountText: a.amountText ?? b.amountText,
      round: a.round ?? b.round,
      valuation: a.valuation ?? b.valuation,
      leadInvestors: uniqBy([...a.leadInvestors, ...b.leadInvestors], normalizeEntity),
    };
  };
  return {
    ...current,
    companies: uniqBy([...current.companies, ...x.companies], (c) => normalizeEntity(c.name)),
    people: uniqBy([...current.people, ...x.people], (p) => normalizeEntity(p.name)),
    investors: uniqBy([...current.investors, ...x.investors], normalizeEntity),
    products: uniqBy([...current.products, ...x.products], normalizeEntity),
    industries: uniqBy([...current.industries, ...x.industries], normalizeForCompare),
    locations: uniqBy([...current.locations, ...x.locations], normalizeForCompare),
    topics: uniqBy([...current.topics, ...x.topics], normalizeForCompare),
    funding: fillFunding(current.funding, x.funding),
    deal: current.deal ?? x.deal,
    eventDate: current.eventDate ?? x.eventDate,
    keyFacts: uniqBy([...current.keyFacts, ...src.keyFacts], normalizeForCompare),
    sourceArticleIds: [...new Set([...current.sourceArticleIds, src.sourceArticleId])],
  };
}

/**
 * A new source is "material" when it adds an entity or a number the story did not have
 * (e.g. a valuation, a new investor). Rephrasings of known facts are not material, so
 * ten outlets covering the same round produce one article, not ten revisions.
 */
export function materialChange(before: StoryFacts, after: StoryFacts, src: SourceFacts): { material: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const names = (f: StoryFacts) => new Set([...f.companies.map((c) => c.name), ...f.people.map((p) => p.name), ...f.investors].map(normalizeEntity));
  const b = names(before);
  const added = [...names(after)].filter((n) => !b.has(n));
  if (added.length) reasons.push(`new_entities:${added.slice(0, 5).join(',')}`);
  if (!before.funding?.amount && after.funding?.amount) reasons.push('new_funding_amount');
  if (!before.funding?.valuation && after.funding?.valuation) reasons.push('new_valuation');
  if (!before.deal && after.deal) reasons.push('new_deal');
  const known = valueSet([...before.keyFacts, before.summary]);
  const fresh = valueSet(src.claims.map((c) => c.text)).filter((v) => v >= 11 && !known.some((k) => sameNumber(k, v)));
  if (fresh.length) reasons.push(`new_numbers:${fresh.slice(0, 5).join(',')}`);
  return { material: reasons.length > 0, reasons };
}

/** Stable revision id of a story's fact base: changes only when facts or sources change. */
export function factsRevision(facts: StoryFacts, claimKeys: string[]): string {
  return sha256(JSON.stringify([facts.sourceArticleIds.slice().sort(), claimKeys.slice().sort(), facts.funding, facts.deal])).slice(0, 16);
}
