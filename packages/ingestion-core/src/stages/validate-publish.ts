import type { Prisma, PrismaClient } from '@lazyfounders/database';
import { checkForeignContacts } from '../content/contacts';
import { assertTransition, evaluatePublishGates, type GateResult } from '../editorial/state-machine';
import { TerminalError } from '../errors';
import type { StageHandler } from '../jobs/execute';
import { emitEvent } from '../jobs/outbox';
import { STAGES } from '../jobs/stages';
import { checkNumbersGrounded, checkOriginality, checkOutputLanguage, checkSafety, checkSeo, hasErrors, type CheckIssue } from '../validate/checks';
import type { PipelineConfig, PipelineDeps } from './context';

export interface ValidationReport {
  issues: CheckIssue[];
  confidence: number;
  schemaValid: boolean;
  dedupDecision: string;
  translationRequired: boolean;
  translationValid: boolean;
  safetyPassed: boolean;
  citations: number;
  checkedAt: string;
}

const TEMPLATE_MARKERS = /^### (30 SEC SUMMARY|TABLE OF CONTENTS|KEY HIGHLIGHTS)\s*$/gm;

/** Everything the LLM wrote: no template markers, no deterministic Sources section. */
export function readerText(v: { headline: string; intro: string; bodyMarkdown: string }): string {
  const body = v.bodyMarkdown.split(/\n## Sources\n/)[0].replace(TEMPLATE_MARKERS, '');
  return `${v.headline}\n${v.intro}\n${body}`;
}

/** article.validate: facts, originality, SEO, safety, attribution; then DRAFT or NEEDS_REVIEW (or auto-approve). */
export function validateHandler(deps: PipelineDeps): StageHandler<{ articleId: string; versionId: string }> {
  return async (env) => {
    const version = await deps.prisma.articleVersion.findUnique({
      where: { id: env.payload.versionId },
      include: {
        citations: true,
        article: {
          include: {
            story: {
              include: {
                claims: true,
                sources: {
                  include: {
                    sourceArticle: {
                      include: {
                        source: true,
                        translations: { orderBy: { createdAt: 'desc' }, take: 1 },
                        extractions: { where: { validationStatus: 'VALID' }, orderBy: { createdAt: 'desc' }, take: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!version) throw new TerminalError('ArticleVersion not found', 'not_found');
    if (version.validationReport) return; // already validated (replay)
    const article = version.article;
    const story = article.story;
    if (!story) throw new TerminalError('Article has no story', 'no_story');

    const sources = story.sources.map((s) => s.sourceArticle);
    const facts = story.facts as Record<string, unknown>;
    const factTexts = [
      JSON.stringify(facts),
      ...story.claims.flatMap((c) => [c.text, JSON.stringify(c.evidence)]),
      ...sources.map((s) => s.headline),
      ...sources.flatMap((s) => s.translations.map((t) => `${t.headline ?? ''}\n${t.summary ?? ''}\n${t.body ?? ''}`)),
    ];
    const text = readerText(version);
    const issues: CheckIssue[] = [
      ...checkNumbersGrounded(text, factTexts),
      ...checkOriginality(text, sources.map((s) => s.bodyText ?? '')),
      ...checkSeo({ headline: version.headline, seoTitle: version.seoTitle, metaDescription: version.metaDescription, slug: article.slug }),
      ...checkSafety(`${text}\n${version.whatThisMeans ?? ''}`),
      ...checkOutputLanguage(`${text}\n${version.whatThisMeans ?? ''}`, deps.config.publishLanguage),
      ...checkForeignContacts(`${text}\n${version.whatThisMeans ?? ''}`),
    ];
    if (version.citations.length === 0) issues.push({ check: 'attribution', severity: 'error', message: 'No source citations' });

    const translationRequired = sources.some((s) => s.language && s.language !== deps.config.publishLanguage);
    const translationValid = sources.every((s) => !s.language || s.language === deps.config.publishLanguage || s.translations[0]?.status === 'VALID');
    if (translationRequired && !translationValid) issues.push({ check: 'translation', severity: 'error', message: 'A source translation needs review' });
    const possibleDup = story.sources.some((s) => s.decision === 'POSSIBLE_DUPLICATE');
    if (possibleDup) issues.push({ check: 'dedup', severity: 'error', message: 'Story has a possible-duplicate source' });

    const confidences = sources.map((s) => s.extractions[0]?.overallConfidence ?? 0);
    const report: ValidationReport = {
      issues,
      confidence: confidences.length ? Math.min(...confidences) : 0,
      schemaValid: true,
      dedupDecision: possibleDup ? 'POSSIBLE_DUPLICATE' : (story.sources.find((s) => s.role === 'PRIMARY')?.decision ?? 'UNIQUE'),
      translationRequired,
      translationValid,
      safetyPassed: !issues.some((i) => i.check === 'safety'),
      citations: version.citations.length,
      checkedAt: new Date().toISOString(),
    };
    const failed = hasErrors(issues);

    await deps.prisma.$transaction(async (tx) => {
      await tx.articleVersion.update({ where: { id: version.id }, data: { validationReport: report as unknown as Prisma.InputJsonValue } });
      const current = await tx.article.findUniqueOrThrow({ where: { id: article.id } });
      if (current.currentVersionId !== version.id) return; // a newer version superseded this one

      const next = failed ? 'NEEDS_REVIEW' : 'DRAFT';
      if (!failed) assertTransition(current.status, 'VALIDATED');
      await tx.article.update({ where: { id: article.id }, data: { status: next } });
      await tx.editorialAction.create({
        data: {
          articleId: article.id,
          versionId: version.id,
          actor: 'pipeline',
          action: 'validate',
          fromStatus: current.status,
          toStatus: next,
          note: failed ? issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ').slice(0, 1000) : null,
        },
      });
      if (failed) return;

      const primary = sources[0]?.source;
      const policy = (primary?.publishingPolicy ?? {}) as { mode?: 'MANUAL' | 'AUTO'; minConfidence?: number };
      const gates = evaluatePublishGates({
        status: 'DRAFT',
        mode: 'auto',
        autoPublishEnabled: deps.config.autoPublishEnabled,
        source: {
          trustStatus: sources.every((s) => s.source.trustStatus === 'APPROVED') ? 'APPROVED' : 'NOT_APPROVED',
          publishingMode: policy.mode ?? 'MANUAL',
          minConfidence: policy.minConfidence ?? 0.85,
          paywall: ((primary?.crawlPolicy ?? {}) as { paywall?: string }).paywall,
        },
        validation: { ...report, errors: 0 },
        citations: report.citations,
        seo: { seoTitle: version.seoTitle, metaDescription: version.metaDescription, slug: article.slug },
      });
      if (!gates.allowed) return; // manual approval (the default)

      await tx.article.update({ where: { id: article.id }, data: { status: 'APPROVED' } });
      await tx.editorialAction.create({
        data: { articleId: article.id, versionId: version.id, actor: 'auto-policy', action: 'approve', fromStatus: 'DRAFT', toStatus: 'APPROVED', note: 'All auto-publish gates passed' },
      });
      await emitEvent(tx, {
        stage: STAGES.PUBLISH,
        idempotencyKey: `${STAGES.PUBLISH}:${version.id}`,
        correlationId: env.correlationId,
        subjectType: 'article_version',
        subjectId: version.id,
        payload: { articleId: article.id, versionId: version.id, actor: 'auto-policy', mode: 'auto' },
      });
    });
    deps.metrics?.articles.inc({ event: failed ? 'needs_review' : 'draft' });
  };
}

export type PublishDecision = { action: 'publish' | 'noop' | 'blocked'; reasons: string[] };

/** Pure publish decision: idempotent re-publish, stale-version guard, then hard gates. */
export function decidePublish(input: {
  article: { status: string; currentVersionId: string | null; publishedVersionId: string | null };
  versionId: string;
  gates: GateResult;
}): PublishDecision {
  if (input.article.publishedVersionId === input.versionId) return { action: 'noop', reasons: ['version_already_published'] };
  if (input.article.currentVersionId !== input.versionId) return { action: 'blocked', reasons: ['stale_version'] };
  if (!input.gates.allowed) return { action: 'blocked', reasons: input.gates.reasons };
  return { action: 'publish', reasons: [] };
}

export interface PublishRequest {
  articleId: string;
  versionId: string;
  actor: string;
  mode: 'manual' | 'auto';
}

/**
 * Publish one article version atomically. Re-publishing the live version is a no-op;
 * unapproved, unattributed or stale versions are refused. History is preserved: the
 * previous live version stays in ArticleVersion and the audit trail records every step.
 */
export async function publishArticle(prisma: PrismaClient, req: PublishRequest, config: Pick<PipelineConfig, 'autoPublishEnabled'>): Promise<PublishDecision> {
  return prisma.$transaction(async (tx) => {
    // Row lock: concurrent publish attempts for one article are serialised.
    await tx.$queryRaw`SELECT id FROM articles WHERE id = ${req.articleId}::uuid FOR UPDATE`;
    const article = await tx.article.findUnique({ where: { id: req.articleId } });
    if (!article) throw new TerminalError('Article not found', 'not_found');
    const version = await tx.articleVersion.findFirst({ where: { id: req.versionId, articleId: article.id }, include: { citations: true } });
    if (!version) throw new TerminalError('Version does not belong to article', 'not_found');

    const story = article.storyId
      ? await tx.story.findUnique({ where: { id: article.storyId }, include: { sources: { include: { sourceArticle: { include: { source: true } } } } } })
      : null;
    const sources = story?.sources.map((s) => s.sourceArticle.source) ?? [];
    const report = (version.validationReport ?? null) as ValidationReport | null;
    const policy = (sources[0]?.publishingPolicy ?? {}) as { mode?: 'MANUAL' | 'AUTO'; minConfidence?: number };

    const gates = evaluatePublishGates({
      status: article.status,
      mode: req.mode,
      autoPublishEnabled: config.autoPublishEnabled,
      source: {
        // Legacy (pre-v2) articles have no story; they were attributed at backfill time.
        trustStatus: !story || sources.every((s) => s.trustStatus === 'APPROVED') ? 'APPROVED' : 'NOT_APPROVED',
        publishingMode: policy.mode ?? 'MANUAL',
        minConfidence: policy.minConfidence ?? 0.85,
        paywall: ((sources[0]?.crawlPolicy ?? {}) as { paywall?: string }).paywall,
      },
      validation: {
        schemaValid: report?.schemaValid ?? false,
        dedupDecision: report?.dedupDecision ?? 'UNKNOWN',
        confidence: report?.confidence ?? 0,
        translationRequired: report?.translationRequired ?? false,
        translationValid: report?.translationValid ?? false,
        safetyPassed: report?.safetyPassed ?? false,
        errors: report ? report.issues.filter((i) => i.severity === 'error').length : 1,
      },
      citations: version.citations.length,
      seo: { seoTitle: version.seoTitle, metaDescription: version.metaDescription, slug: article.slug },
    });

    const decision = decidePublish({ article, versionId: version.id, gates });
    if (decision.action === 'noop') {
      await tx.editorialAction.create({
        data: { articleId: article.id, versionId: version.id, actor: req.actor, action: 'republish_noop', fromStatus: article.status, toStatus: article.status },
      });
      return decision;
    }
    if (decision.action === 'blocked') {
      await tx.editorialAction.create({
        data: { articleId: article.id, versionId: version.id, actor: req.actor, action: 'publish_blocked', fromStatus: article.status, toStatus: article.status, note: decision.reasons.join(', ') },
      });
      return decision;
    }
    assertTransition(article.status, 'PUBLISHED');
    await tx.article.update({
      where: { id: article.id },
      data: { status: 'PUBLISHED', publishedVersionId: version.id, publishedAt: article.publishedAt ?? new Date() },
    });
    await tx.editorialAction.create({
      data: { articleId: article.id, versionId: version.id, actor: req.actor, action: 'publish', fromStatus: article.status, toStatus: 'PUBLISHED', note: `v${version.version} (${req.mode})` },
    });
    return decision;
  });
}

/** article.publish: runs the publish transaction; blocked publishes are audited, not retried. */
export function publishHandler(deps: PipelineDeps): StageHandler<PublishRequest> {
  return async (env) => {
    const decision = await publishArticle(deps.prisma, env.payload, deps.config);
    deps.logger.info({ correlationId: env.correlationId, ...env.payload, decision }, 'publish');
    if (decision.action === 'publish') {
      deps.metrics?.articles.inc({ event: 'published' });
      await revalidate(env.payload.articleId, deps).catch((err) => deps.logger.warn({ err: (err as Error).message }, 'revalidate failed'));
    }
  };
}

async function revalidate(articleId: string, deps: PipelineDeps): Promise<void> {
  const url = process.env.REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  const article = await deps.prisma.article.findUnique({ where: { id: articleId }, select: { slug: true, category: true } });
  if (!article) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ paths: ['/', `/news/article/${article.slug}`, ...(article.category ? [`/news/category/${article.category}`] : [])] }),
    signal: AbortSignal.timeout(5_000),
  });
}
