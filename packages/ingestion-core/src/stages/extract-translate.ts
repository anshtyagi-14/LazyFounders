import type { Prisma } from '@lazyfounders/database';
import { PROMPT_VERSIONS, SCHEMA_VERSIONS, type Extraction } from '@lazyfounders/llm';
import { TerminalError } from '../errors';
import type { StageHandler } from '../jobs/execute';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import type { PipelineDeps } from './context';
import { runExtraction, runTranslation, translationTarget, type TranslationPolicy } from './structure';

const EXTRACT_PROMPT_VERSION = PROMPT_VERSIONS.extract;
const TRANSLATE_PROMPT_VERSION = PROMPT_VERSIONS.translate;

type Payload = { sourceArticleId: string };

/** article.extract: LLM fact extraction on the ORIGINAL-language text. */
export function extractHandler(deps: PipelineDeps): StageHandler<Payload> {
  return async (env) => {
    const sa = await deps.prisma.sourceArticle.findUnique({ where: { id: env.payload.sourceArticleId }, include: { source: true } });
    if (!sa) throw new TerminalError('SourceArticle not found', 'not_found');
    if (!sa.bodyText || !sa.language) throw new TerminalError('SourceArticle is not normalised', 'not_normalized');

    const prior = await deps.prisma.factExtraction.findUnique({
      where: {
        sourceArticleId_promptVersion_schemaVersion: {
          sourceArticleId: sa.id,
          promptVersion: EXTRACT_PROMPT_VERSION,
          schemaVersion: SCHEMA_VERSIONS.extraction,
        },
      },
    });
    if (prior?.validationStatus === 'VALID') {
      await deps.prisma.$transaction((tx) => emitAfterExtraction(tx, deps, env.correlationId, sa.id, sa.language!, sa.source.translationPolicy));
      return;
    }
    if (prior) return; // INVALID / NEEDS_REVIEW already recorded; an editor decides.

    const outcome = await runExtraction(deps.llm, {
      publisher: sa.publisher,
      url: sa.canonicalUrl ?? sa.originalUrl,
      language: sa.language,
      headline: sa.headline,
      publishedAt: sa.publishedAt,
      bodyText: sa.bodyText,
    });
    if (outcome.status !== 'VALID') deps.metrics?.llmValidationFailures.inc({ task: 'extract' });

    await deps.prisma.$transaction(async (tx) => {
      await tx.factExtraction.create({
        data: {
          sourceArticleId: sa.id,
          model: outcome.model,
          promptVersion: outcome.promptVersion,
          schemaVersion: outcome.schemaVersion,
          payload: (outcome.extraction ?? undefined) as Prisma.InputJsonValue | undefined,
          overallConfidence: outcome.extraction?.overallConfidence ?? null,
          validationStatus: outcome.status,
          errors: (outcome.errors ?? outcome.grounding ?? undefined) as Prisma.InputJsonValue | undefined,
          attempts: outcome.attempts,
        },
      });
      if (outcome.status !== 'VALID') {
        // Invalid or ungrounded output never continues down the pipeline.
        await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'NEEDS_REVIEW', stateReason: `extraction_${outcome.status.toLowerCase()}` } });
        return;
      }
      await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'STRUCTURED', stateReason: null } });
      await emitAfterExtraction(tx, deps, env.correlationId, sa.id, sa.language!, sa.source.translationPolicy);
    });
  };
}

async function emitAfterExtraction(
  tx: Prisma.TransactionClient,
  deps: PipelineDeps,
  correlationId: string,
  sourceArticleId: string,
  language: string,
  policy: unknown,
): Promise<void> {
  const target = translationTarget(policy as TranslationPolicy | null, language, deps.config.publishLanguage);
  const stage = target ? STAGES.TRANSLATE : STAGES.DEDUPE;
  await emitEvent(tx, {
    stage,
    idempotencyKey: `${stage}:${sourceArticleId}`,
    correlationId,
    subjectType: 'source_article',
    subjectId: sourceArticleId,
    payload: { sourceArticleId, ...(target ? { targetLanguage: target } : {}) },
  });
}

/** article.translate: translate extracted facts into the publishing language and validate them. */
export function translateHandler(deps: PipelineDeps): StageHandler<Payload & { targetLanguage: string }> {
  return async (env) => {
    const { sourceArticleId, targetLanguage } = env.payload;
    const sa = await deps.prisma.sourceArticle.findUnique({
      where: { id: sourceArticleId },
      include: { extractions: { where: { validationStatus: 'VALID' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!sa?.language) throw new TerminalError('SourceArticle not ready for translation', 'not_ready');
    const fx = sa.extractions[0];
    if (!fx?.payload) throw new TerminalError('No valid extraction to translate', 'no_extraction');

    const existing = await deps.prisma.translation.findUnique({
      where: { sourceArticleId_targetLanguage_promptVersion: { sourceArticleId, targetLanguage, promptVersion: TRANSLATE_PROMPT_VERSION } },
    });
    if (existing) {
      if (existing.status === 'VALID') await deps.prisma.$transaction((tx) => emitDedupe(tx, env.correlationId, sourceArticleId));
      return;
    }

    const outcome = await runTranslation(deps.llm, {
      extraction: fx.payload as unknown as Extraction,
      headline: sa.headline ?? '',
      sourceLanguage: sa.language,
      targetLanguage,
    });
    if (outcome.status !== 'VALID') deps.metrics?.llmValidationFailures.inc({ task: 'translate' });

    await deps.prisma.$transaction(async (tx) => {
      await tx.translation.create({
        data: {
          sourceArticleId,
          sourceLanguage: sa.language!,
          targetLanguage,
          model: outcome.model,
          modelVersion: outcome.model,
          promptVersion: outcome.promptVersion,
          headline: outcome.output?.headline ?? null,
          summary: outcome.output?.summary ?? null,
          // Structured translation of facts/claims; the original text stays on SourceArticle.
          body: outcome.output ? JSON.stringify({ keyFacts: outcome.output.keyFacts, claims: outcome.output.claims }) : null,
          protectedTokens: outcome.protectedTokens,
          validation: outcome.issues as unknown as Prisma.InputJsonValue,
          status: outcome.status,
        },
      });
      if (outcome.status !== 'VALID') {
        await tx.sourceArticle.update({ where: { id: sourceArticleId }, data: { state: 'NEEDS_REVIEW', stateReason: 'translation_needs_review' } });
        return;
      }
      await emitDedupe(tx, env.correlationId, sourceArticleId);
    });
  };
}

function emitDedupe(tx: Prisma.TransactionClient, correlationId: string, sourceArticleId: string) {
  return emitEvent(tx, {
    stage: STAGES.DEDUPE,
    idempotencyKey: `${STAGES.DEDUPE}:${sourceArticleId}`,
    correlationId,
    subjectType: 'source_article',
    subjectId: sourceArticleId,
    payload: { sourceArticleId },
  });
}
