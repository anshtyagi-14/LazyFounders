import type { Extraction } from '@lazyfounders/llm';

/** Normalise for evidence matching: NFKC, unified quotes/dashes, collapsed whitespace, lowercase. */
export function normalizeForEvidence(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″「」『』]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function appearsIn(needle: string | null | undefined, haystackNormalized: string): boolean {
  if (!needle) return false;
  const n = normalizeForEvidence(needle);
  return n.length > 0 && haystackNormalized.includes(n);
}

export interface GroundingReport {
  droppedClaims: Array<{ text: string; reason: string }>;
  droppedEntities: string[];
  nulledFields: string[];
  keptClaims: number;
}

export interface GroundedExtraction {
  extraction: Extraction;
  report: GroundingReport;
}

const MIN_EVIDENCE_CHARS = 8;

/**
 * Deterministic post-validation of LLM extraction against the source text:
 *  - claims whose evidence is not a verbatim span of the source are dropped;
 *  - quotes must additionally contain their own text verbatim;
 *  - companies / people / investors / products not mentioned in the source are dropped;
 *  - funding and deal amounts whose amount text is not in the source become null;
 *  - confidence values are clamped to 0..1.
 * Unknown stays null: nothing here ever fills a value in.
 */
export function groundExtraction(extraction: Extraction, sourceText: string, headline?: string | null): GroundedExtraction {
  const hay = normalizeForEvidence(`${headline ?? ''}\n${sourceText}`);
  const report: GroundingReport = { droppedClaims: [], droppedEntities: [], nulledFields: [], keptClaims: 0 };
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

  const claims = extraction.claims.filter((c) => {
    if (normalizeForEvidence(c.evidence).length < MIN_EVIDENCE_CHARS) {
      report.droppedClaims.push({ text: c.text, reason: 'evidence_too_short' });
      return false;
    }
    if (!appearsIn(c.evidence, hay)) {
      report.droppedClaims.push({ text: c.text, reason: 'evidence_not_in_source' });
      return false;
    }
    if (c.kind === 'quote' && !appearsIn(c.text, hay)) {
      report.droppedClaims.push({ text: c.text, reason: 'quote_not_verbatim' });
      return false;
    }
    return true;
  });
  report.keptClaims = claims.length;

  const keepNamed = <T>(items: T[], name: (x: T) => string): T[] =>
    items.filter((x) => {
      const ok = appearsIn(name(x), hay);
      if (!ok) report.droppedEntities.push(name(x));
      return ok;
    });

  let funding = extraction.funding;
  if (funding) {
    const amountOk = funding.amountText ? appearsIn(funding.amountText, hay) : false;
    if (!amountOk && (funding.amount !== null || funding.amountText !== null)) {
      report.nulledFields.push('funding.amount');
      funding = { ...funding, amount: null, amountText: null, currency: null };
    }
    if (funding.round && !appearsIn(funding.round, hay)) {
      report.nulledFields.push('funding.round');
      funding = { ...funding, round: null };
    }
    funding = { ...funding, leadInvestors: keepNamed(funding.leadInvestors, (x) => x) };
  }

  let deal = extraction.deal;
  if (deal && (deal.value !== null || deal.valueText !== null) && !(deal.valueText && appearsIn(deal.valueText, hay))) {
    report.nulledFields.push('deal.value');
    deal = { ...deal, value: null, valueText: null, currency: null };
  }
  if (deal?.counterparty && !appearsIn(deal.counterparty, hay)) {
    report.nulledFields.push('deal.counterparty');
    deal = { ...deal, counterparty: null };
  }

  let eventDate = extraction.eventDate;
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    report.nulledFields.push('eventDate');
    eventDate = null;
  }

  return {
    extraction: {
      ...extraction,
      claims: claims.map((c) => ({ ...c, confidence: clamp(c.confidence) })),
      companies: keepNamed(extraction.companies, (c) => c.name),
      people: keepNamed(extraction.people, (p) => p.name),
      investors: keepNamed(extraction.investors, (x) => x),
      products: keepNamed(extraction.products, (x) => x),
      funding,
      deal,
      eventDate,
      overallConfidence: clamp(extraction.overallConfidence),
    },
    report,
  };
}

/** The extraction is usable for story building only if the core event survived grounding. */
export function isUsableExtraction(g: GroundedExtraction, minClaims = 1): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (g.report.keptClaims < minClaims) reasons.push('no_grounded_claims');
  if (g.extraction.companies.length === 0 && g.extraction.people.length === 0) reasons.push('no_grounded_entities');
  const total = g.report.keptClaims + g.report.droppedClaims.length;
  if (total > 0 && g.report.droppedClaims.length / total > 0.5) reasons.push('majority_of_claims_ungrounded');
  return { ok: reasons.length === 0, reasons };
}
