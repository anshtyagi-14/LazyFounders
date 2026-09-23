import { FakeEmbeddingClient } from '@lazyfounders/llm';
import { describe, expect, it } from 'vitest';
import { buildEventKey, decideDedup, type DedupCandidate, type DedupSubject } from '../dedup/decide';
import { headlineSimilarity, normalizeEntity } from '../dedup/similarity';
import { eventKeyFor, materialChange, mergeStoryFacts, toSourceFacts } from '../stages/story';
import { zeptoExtraction } from './fixtures/facts';

const emb = new FakeEmbeddingClient();

function subject(p: Partial<DedupSubject> = {}): DedupSubject {
  return {
    sourceArticleId: 'sa-new',
    canonicalFingerprint: 'fp-new',
    aliasFingerprints: [],
    contentHash: 'hash-new',
    headline: 'Zepto raises $25 million in Series B led by Nexus',
    entities: ['Zepto', 'Nexus Venture Partners'],
    eventKey: 'funding|zepto|USD:25000000',
    eventDate: new Date('2026-09-20'),
    embedding: null,
    ...p,
  };
}

function candidate(p: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    storyId: 'story-1',
    sourceArticleId: 'sa-old',
    canonicalFingerprint: 'fp-old',
    contentHash: 'hash-old',
    headline: 'Zepto bags $25 Mn Series B from Nexus Venture Partners',
    entities: ['Zepto Pvt Ltd', 'Nexus Venture Partners'],
    eventKey: 'funding|zepto|USD:25000000',
    eventDate: new Date('2026-09-21'),
    embedding: null,
    ...p,
  };
}

describe('deduplication', () => {
  it('normalises entities and event keys across publishers', () => {
    expect(normalizeEntity('Zepto Pvt. Ltd.')).toBe('zepto');
    expect(normalizeEntity('株式会社Sakana AI')).toBe('sakana ai');
    expect(buildEventKey({ storyType: 'funding', primaryEntity: 'Zepto Inc', amount: 25_000_000, currency: 'usd' })).toBe(
      buildEventKey({ storyType: 'funding', primaryEntity: 'ZEPTO', amount: 25_000_001, currency: 'USD' }),
    );
    expect(eventKeyFor(zeptoExtraction())).toBe('funding|zepto|USD:25000000');
  });

  // Required test 11
  it('exact duplicates are skipped (same URL identity or same normalised content)', () => {
    const sameUrl = decideDedup(subject({ canonicalFingerprint: 'fp-old', contentHash: 'hash-old' }), [candidate()]);
    expect(sameUrl).toMatchObject({ decision: 'EXACT_DUPLICATE', storyId: 'story-1' });

    const viaRedirectAlias = decideDedup(subject({ aliasFingerprints: ['fp-old'], contentHash: 'hash-old' }), [candidate()]);
    expect(viaRedirectAlias.decision).toBe('EXACT_DUPLICATE');

    const syndicated = decideDedup(subject({ contentHash: 'hash-old' }), [candidate()]);
    expect(syndicated).toMatchObject({ decision: 'EXACT_DUPLICATE', reasons: ['same_content_hash'] });

    const updatedSameUrl = decideDedup(subject({ canonicalFingerprint: 'fp-old' }), [candidate()]);
    expect(updatedSameUrl).toMatchObject({ decision: 'SAME_STORY', isUpdate: true });
  });

  // Required test 12
  it('cross-publisher (and cross-language) coverage of one event groups into one story', async () => {
    // Different publisher, different URL and wording: grouped by event key.
    expect(decideDedup(subject(), [candidate()])).toMatchObject({ decision: 'SAME_STORY', storyId: 'story-1', reasons: ['event_key'] });

    // No event key (amount not reported), but semantic similarity + shared entities.
    const a = await emb.embed('Zepto raises funding in Series B round led by Nexus Venture Partners quick commerce');
    const b = await emb.embed('Zepto raises funding in Series B round led by Nexus Venture Partners for quick commerce');
    const r = decideDedup(subject({ eventKey: null, embedding: a }), [candidate({ eventKey: null, embedding: b })]);
    expect(r.decision).toBe('SAME_STORY');

    // Similar topic, different company: never merged automatically.
    const other = decideDedup(subject({ eventKey: null, entities: ['Blinkit'], headline: 'Blinkit raises $25 million' }), [
      candidate({ eventKey: null }),
    ]);
    expect(other.decision).not.toBe('SAME_STORY');

    // Same entity, events far apart in time: not the same story.
    const later = decideDedup(subject({ eventDate: new Date('2026-12-01') }), [candidate()]);
    expect(later.decision).not.toBe('SAME_STORY');

    // Merging: facts from both sources are preserved, provenance kept.
    const s1 = toSourceFacts({ id: 'sa-1', publisher: 'YourStory', url: 'https://yourstory.com/a', language: 'en', headline: 'Zepto raises' }, zeptoExtraction(), null);
    const s2 = toSourceFacts(
      { id: 'sa-2', publisher: 'Inc42', url: 'https://inc42.com/b', language: 'en', headline: 'Zepto bags' },
      zeptoExtraction({
        investors: ['Nexus Venture Partners', 'Glade Brook Capital'],
        funding: { ...zeptoExtraction().funding!, valuation: 200_000_000 },
      }),
      null,
    );
    const merged = mergeStoryFacts(mergeStoryFacts(null, s1), s2);
    expect(merged.sourceArticleIds).toEqual(['sa-1', 'sa-2']);
    expect(merged.investors).toContain('Glade Brook Capital');
    expect(merged.funding?.valuation).toBe(200_000_000);
    expect(materialChange(mergeStoryFacts(null, s1), merged, s2).material).toBe(true);

    // A pure rephrasing adds nothing material -> no regeneration.
    const s3 = toSourceFacts({ id: 'sa-3', publisher: 'ET', url: 'https://et.com/c', language: 'en', headline: 'Zepto funding' }, zeptoExtraction(), null);
    const before = mergeStoryFacts(null, s1);
    expect(materialChange(before, mergeStoryFacts(before, s3), s3).material).toBe(false);
  });

  it('headline similarity is script-agnostic', () => {
    expect(headlineSimilarity('Zepto raises $25M Series B', 'Zepto raises $25M Series-B round')).toBeGreaterThan(0.6);
    expect(headlineSimilarity('Sakana AIが30億円を調達', 'Sakana AIが30億円調達')).toBeGreaterThan(0.4);
  });
});
