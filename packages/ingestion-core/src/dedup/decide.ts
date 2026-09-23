import { cosine, entityOverlap, headlineSimilarity, normalizeEntity } from './similarity';

export type DedupDecision = 'EXACT_DUPLICATE' | 'SAME_STORY' | 'POSSIBLE_DUPLICATE' | 'UNIQUE';

export interface DedupSubject {
  sourceArticleId: string;
  canonicalFingerprint: string;
  aliasFingerprints: string[];
  contentHash: string | null;
  headline: string | null;
  entities: string[];
  eventKey: string | null;
  eventDate: Date | null;
  embedding: number[] | null;
}

export interface DedupCandidate {
  storyId: string;
  sourceArticleId: string;
  canonicalFingerprint: string;
  contentHash: string | null;
  headline: string | null;
  entities: string[];
  eventKey: string | null;
  eventDate: Date | null;
  embedding: number[] | null;
}

export interface DedupThresholds {
  sameStoryCosine: number;
  reviewCosine: number;
  sameStoryHeadline: number;
  reviewHeadline: number;
  eventDateWindowDays: number;
}

export const DEFAULT_THRESHOLDS: DedupThresholds = {
  sameStoryCosine: Number(process.env.DEDUP_SAME_STORY_COS || 0.9),
  reviewCosine: Number(process.env.DEDUP_REVIEW_COS || 0.8),
  sameStoryHeadline: 0.75,
  reviewHeadline: 0.5,
  eventDateWindowDays: 3,
};

export interface DedupResult {
  decision: DedupDecision;
  storyId: string | null;
  matchedSourceArticleId: string | null;
  /** Update of an article we already have (same URL, new content). */
  isUpdate: boolean;
  score: number;
  reasons: string[];
}

export interface EventKeyInput {
  storyType: string;
  primaryEntity: string | null;
  amount: number | null;
  currency: string | null;
}

/**
 * Event identity independent of publisher and language: story type + normalised
 * primary company + amount bucket. Returns null when there is not enough signal
 * (then only similarity layers apply).
 */
export function buildEventKey(e: EventKeyInput): string | null {
  if (!e.primaryEntity) return null;
  const entity = normalizeEntity(e.primaryEntity);
  if (!entity) return null;
  let amount = '';
  if (e.amount && e.currency) {
    // Two significant figures: "$25M" and "$25.0 million" match; rounding noise is ignored.
    const mag = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(e.amount))) - 1);
    amount = `${e.currency.toUpperCase()}:${Math.round(e.amount / mag) * mag}`;
  }
  return `${e.storyType}|${entity}|${amount}`;
}

function datesClose(a: Date | null, b: Date | null, days: number): boolean {
  if (!a || !b) return true;
  return Math.abs(a.getTime() - b.getTime()) <= days * 86_400_000;
}

/**
 * Layered deduplication:
 *   1. canonical / redirected URL identity  2. normalised content hash
 *   3. event key (+ date window)            4. headline similarity
 *   5. semantic embedding similarity (cross-publisher, cross-language)
 * Pure function: candidate retrieval (SQL: trigram + event key + pgvector) is done by the caller.
 */
export function decideDedup(subject: DedupSubject, candidates: DedupCandidate[], t: DedupThresholds = DEFAULT_THRESHOLDS): DedupResult {
  const urlIds = new Set([subject.canonicalFingerprint, ...subject.aliasFingerprints]);

  for (const c of candidates) {
    if (c.sourceArticleId === subject.sourceArticleId) continue;
    if (urlIds.has(c.canonicalFingerprint)) {
      const same = subject.contentHash !== null && subject.contentHash === c.contentHash;
      return {
        decision: same ? 'EXACT_DUPLICATE' : 'SAME_STORY',
        storyId: c.storyId,
        matchedSourceArticleId: c.sourceArticleId,
        isUpdate: !same,
        score: 1,
        reasons: [same ? 'same_url_same_content' : 'same_url_updated_content'],
      };
    }
  }
  for (const c of candidates) {
    if (c.sourceArticleId === subject.sourceArticleId) continue;
    if (subject.contentHash && subject.contentHash === c.contentHash) {
      return { decision: 'EXACT_DUPLICATE', storyId: c.storyId, matchedSourceArticleId: c.sourceArticleId, isUpdate: false, score: 1, reasons: ['same_content_hash'] };
    }
  }

  let best: DedupResult = { decision: 'UNIQUE', storyId: null, matchedSourceArticleId: null, isUpdate: false, score: 0, reasons: [] };
  const rank = { UNIQUE: 0, POSSIBLE_DUPLICATE: 1, SAME_STORY: 2, EXACT_DUPLICATE: 3 } as const;

  for (const c of candidates) {
    if (c.sourceArticleId === subject.sourceArticleId) continue;
    const reasons: string[] = [];
    const overlap = entityOverlap(subject.entities, c.entities);
    const cos = cosine(subject.embedding, c.embedding);
    const head = headlineSimilarity(subject.headline, c.headline);
    const close = datesClose(subject.eventDate, c.eventDate, t.eventDateWindowDays);
    let decision: DedupDecision = 'UNIQUE';
    let score = Math.max(cos, head);

    if (subject.eventKey && subject.eventKey === c.eventKey && close) {
      decision = 'SAME_STORY';
      score = 1;
      reasons.push('event_key');
    } else if (cos >= t.sameStoryCosine && overlap > 0 && close) {
      decision = 'SAME_STORY';
      reasons.push(`embedding_cos=${cos.toFixed(3)}`, `entity_overlap=${overlap}`);
    } else if (head >= t.sameStoryHeadline && overlap > 0 && close) {
      decision = 'SAME_STORY';
      reasons.push(`headline_sim=${head.toFixed(3)}`, `entity_overlap=${overlap}`);
    } else if (cos >= t.reviewCosine || (head >= t.reviewHeadline && overlap > 0)) {
      decision = 'POSSIBLE_DUPLICATE';
      reasons.push(`embedding_cos=${cos.toFixed(3)}`, `headline_sim=${head.toFixed(3)}`, `entity_overlap=${overlap}`);
    }

    if (rank[decision] > rank[best.decision] || (rank[decision] === rank[best.decision] && score > best.score && decision !== 'UNIQUE')) {
      best = { decision, storyId: c.storyId, matchedSourceArticleId: c.sourceArticleId, isUpdate: false, score, reasons };
    }
  }
  return best;
}
