import { Prisma } from '@lazyfounders/database';
import type { Extraction, TranslationOutput } from '@lazyfounders/llm';
import { decideDedup, type DedupCandidate, type DedupSubject } from '../dedup/decide';
import { TerminalError } from '../errors';
import type { StageHandler } from '../jobs/execute';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import type { PipelineDeps } from './context';
import {
  claimKey,
  entitiesOf,
  eventKeyFor,
  factsRevision,
  materialChange,
  mergeStoryFacts,
  primaryEntity,
  toSourceFacts,
  type SourceFacts,
  type StoryFacts,
} from './story';

/** Single advisory lock key: story creation/attachment is serialised (short critical section). */
const DEDUP_LOCK_KEY = 7_345_001;

const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`;

/**
 * story.dedupe: layered deduplication and story grouping.
 * UNIQUE -> new story; SAME_STORY -> source attached as supporting evidence (article
 * regenerated only when it adds material facts); POSSIBLE_DUPLICATE -> editorial review;
 * EXACT_DUPLICATE -> skipped (URL alias recorded).
 */
export function dedupeHandler(deps: PipelineDeps): StageHandler<{ sourceArticleId: string }> {
  return async (env) => {
    const saId = env.payload.sourceArticleId;
    const sa = await deps.prisma.sourceArticle.findUnique({
      where: { id: saId },
      include: {
        storySource: true,
        extractions: { where: { validationStatus: 'VALID' }, orderBy: { createdAt: 'desc' }, take: 1 },
        translations: { where: { status: 'VALID', targetLanguage: deps.config.publishLanguage }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!sa) throw new TerminalError('SourceArticle not found', 'not_found');
    if (sa.storySource || sa.state === 'ARCHIVED') return; // already decided (replay-safe)
    const fx = sa.extractions[0];
    if (!fx?.payload) throw new TerminalError('No valid extraction', 'no_extraction');
    const extraction = fx.payload as unknown as Extraction;
    const tr = sa.translations[0];
    const translation = tr
      ? { headline: tr.headline, summary: tr.summary, ...(JSON.parse(tr.body ?? '{}') as Pick<TranslationOutput, 'keyFacts' | 'claims'>) }
      : null;

    const sf = toSourceFacts(
      { id: sa.id, publisher: sa.publisher, url: sa.canonicalUrl ?? sa.originalUrl, language: sa.language ?? 'und', headline: sa.headline },
      extraction,
      translation ? { headline: translation.headline, summary: translation.summary, keyFacts: translation.keyFacts ?? [], claims: translation.claims ?? [] } : null,
    );
    // Embed the publishing-language view so coverage in different languages lands close together.
    const embedding = await deps.embeddings.embed(`${sf.headline}\n${sf.summary}\n${sf.keyFacts.slice(0, 5).join('\n')}`);
    const aliases = await deps.prisma.urlAlias.findMany({ where: { canonicalFingerprint: sa.canonicalFingerprint }, select: { fingerprint: true } });

    const subject: DedupSubject = {
      sourceArticleId: sa.id,
      canonicalFingerprint: sa.canonicalFingerprint,
      aliasFingerprints: aliases.map((a) => a.fingerprint),
      contentHash: sa.contentHash,
      headline: sf.headline,
      entities: entitiesOf(extraction),
      eventKey: eventKeyFor(extraction),
      eventDate: extraction.eventDate ? new Date(extraction.eventDate) : sa.publishedAt,
      embedding,
    };

    await deps.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEDUP_LOCK_KEY})`;
        const candidates = await loadCandidates(tx, subject, sa.headline, deps.config.dedupWindowDays);
        const result = decideDedup(subject, candidates);
        deps.logger.info({ correlationId: env.correlationId, sourceArticleId: sa.id, decision: result.decision, reasons: result.reasons }, 'dedup decision');

        if (result.decision === 'EXACT_DUPLICATE') {
          await tx.sourceArticle.update({
            where: { id: sa.id },
            data: { state: 'ARCHIVED', stateReason: `exact_duplicate_of:${result.matchedSourceArticleId}` },
          });
          return;
        }

        if (result.decision === 'SAME_STORY' && result.storyId) {
          const story = await tx.story.findUniqueOrThrow({ where: { id: result.storyId } });
          const before = story.facts as unknown as StoryFacts;
          const after = mergeStoryFacts(before, sf);
          const change = materialChange(before, after, sf);
          await tx.storySource.create({
            data: {
              storyId: story.id,
              sourceArticleId: sa.id,
              role: 'SUPPORTING',
              decision: 'SAME_STORY',
              similarity: result.score,
              reasons: { dedup: result.reasons, material: change.reasons, isUpdate: result.isUpdate },
              contributedFacts: change.material || result.isUpdate,
            },
          });
          const keys = await upsertClaims(tx, story.id, sf);
          await tx.story.update({ where: { id: story.id }, data: { facts: after as unknown as Prisma.InputJsonValue } });
          await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'DEDUPED' } });
          if (change.material || result.isUpdate) await emitGenerate(tx, env.correlationId, story.id, factsRevision(after, keys));
          return;
        }

        const facts = mergeStoryFacts(null, sf);
        const story = await tx.story.create({
          data: {
            storyType: extraction.storyType,
            eventKey: subject.eventKey,
            primaryEntity: primaryEntity(extraction),
            eventDate: subject.eventDate,
            headline: sf.headline.slice(0, 500),
            facts: facts as unknown as Prisma.InputJsonValue,
            status: result.decision === 'POSSIBLE_DUPLICATE' ? 'NEEDS_REVIEW' : 'ACTIVE',
          },
        });
        await tx.$executeRaw`UPDATE stories SET embedding = ${toVector(embedding)}::vector WHERE id = ${story.id}::uuid`;
        await tx.storySource.create({
          data: {
            storyId: story.id,
            sourceArticleId: sa.id,
            role: 'PRIMARY',
            decision: result.decision,
            similarity: result.score,
            reasons: { dedup: result.reasons, possibleDuplicateOf: result.decision === 'POSSIBLE_DUPLICATE' ? result.storyId : null },
            contributedFacts: true,
          },
        });
        const keys = await upsertClaims(tx, story.id, sf);
        if (result.decision === 'POSSIBLE_DUPLICATE') {
          await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'NEEDS_REVIEW', stateReason: `possible_duplicate_of_story:${result.storyId}` } });
          return;
        }
        await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'DEDUPED' } });
        await emitGenerate(tx, env.correlationId, story.id, factsRevision(facts, keys));
      },
      { timeout: 60_000 },
    );
  };
}

async function upsertClaims(tx: Prisma.TransactionClient, storyId: string, sf: SourceFacts): Promise<string[]> {
  const keys: string[] = [];
  for (const c of sf.claims) {
    const key = claimKey(c.text);
    keys.push(key);
    const existing = await tx.storyClaim.findUnique({ where: { storyId_claimKey: { storyId, claimKey: key } } });
    if (existing) {
      if (!existing.sourceArticleIds.includes(sf.sourceArticleId)) {
        await tx.storyClaim.update({ where: { id: existing.id }, data: { sourceArticleIds: { push: sf.sourceArticleId } } });
      }
      continue;
    }
    await tx.storyClaim.create({
      data: {
        storyId,
        text: c.text,
        kind: c.kind,
        claimKey: key,
        sourceArticleIds: [sf.sourceArticleId],
        evidence: { sourceArticleId: sf.sourceArticleId, original: c.originalText, evidence: c.evidence, language: sf.language, speaker: c.speaker },
        confidence: c.confidence,
        translated: sf.translated,
        // Only original-language, verbatim-grounded quotes count as verified.
        verified: c.kind === 'quote' && !sf.translated,
      },
    });
  }
  return keys;
}

function emitGenerate(tx: Prisma.TransactionClient, correlationId: string, storyId: string, revision: string) {
  return emitEvent(tx, {
    stage: STAGES.GENERATE,
    idempotencyKey: `${STAGES.GENERATE}:${storyId}:${revision}`,
    correlationId,
    subjectType: 'story',
    subjectId: storyId,
    payload: { storyId, revision },
  });
}

async function loadCandidates(tx: Prisma.TransactionClient, s: DedupSubject, originalHeadline: string | null, windowDays: number): Promise<DedupCandidate[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const storyIds = new Set<string>();

  const byIdentity = await tx.sourceArticle.findMany({
    where: {
      id: { not: s.sourceArticleId },
      storySource: { isNot: null },
      OR: [{ canonicalFingerprint: { in: [s.canonicalFingerprint, ...s.aliasFingerprints] } }, ...(s.contentHash ? [{ contentHash: s.contentHash }] : [])],
    },
    select: { storySource: { select: { storyId: true } } },
    take: 20,
  });
  byIdentity.forEach((r) => r.storySource && storyIds.add(r.storySource.storyId));

  if (s.eventKey) {
    const byKey = await tx.story.findMany({ where: { eventKey: s.eventKey, createdAt: { gte: since } }, select: { id: true }, take: 20 });
    byKey.forEach((r) => storyIds.add(r.id));
  }
  if (originalHeadline) {
    const byHeadline = await tx.$queryRaw<Array<{ story_id: string }>>`
      SELECT ss.story_id FROM source_articles sa
      JOIN story_sources ss ON ss.source_article_id = sa.id
      WHERE sa.created_at >= ${since} AND sa.id <> ${s.sourceArticleId}::uuid AND similarity(sa.headline, ${originalHeadline}) > 0.3
      ORDER BY similarity(sa.headline, ${originalHeadline}) DESC LIMIT 10`;
    byHeadline.forEach((r) => storyIds.add(r.story_id));
  }
  if (s.embedding) {
    const byVector = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM stories WHERE embedding IS NOT NULL AND created_at >= ${since}
      ORDER BY embedding <=> ${toVector(s.embedding)}::vector LIMIT 10`;
    byVector.forEach((r) => storyIds.add(r.id));
  }
  if (storyIds.size === 0) return [];

  const ids = [...storyIds];
  const stories = await tx.story.findMany({
    where: { id: { in: ids } },
    include: { sources: { include: { sourceArticle: { select: { id: true, canonicalFingerprint: true, contentHash: true } } } } },
  });
  const vectors = await tx.$queryRaw<Array<{ id: string; embedding: string | null }>>`
    SELECT id, embedding::text AS embedding FROM stories WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
  const vec = new Map(vectors.map((v) => [v.id, v.embedding ? (JSON.parse(v.embedding) as number[]) : null]));

  return stories.flatMap((st) => {
    const facts = st.facts as unknown as StoryFacts | null;
    const entities = facts ? [...facts.companies.map((c) => c.name), ...facts.investors, ...facts.people.map((p) => p.name)] : [];
    return st.sources.map((src) => ({
      storyId: st.id,
      sourceArticleId: src.sourceArticle.id,
      canonicalFingerprint: src.sourceArticle.canonicalFingerprint,
      contentHash: src.sourceArticle.contentHash,
      headline: st.headline,
      entities,
      eventKey: st.eventKey,
      eventDate: st.eventDate,
      embedding: vec.get(st.id) ?? null,
    }));
  });
}
