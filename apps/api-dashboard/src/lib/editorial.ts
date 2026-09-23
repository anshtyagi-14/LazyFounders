import { Queue } from 'bullmq';
import { canTransition, renderSources, versionContentHash, STAGES, bullJobId, queueName, type ArticleStatus, type Stage } from '@lazyfounders/ingestion-core/editorial';
import { prisma } from '@/lib/prisma';
import type { Editor } from '@/lib/editor-auth';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export class EditorialError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

/** Queue the next stage through the transactional outbox (dispatched by the pipeline services). */
async function emit(tx: Tx, e: { stage: Stage; idempotencyKey: string; correlationId: string; subjectType: string; subjectId: string; payload: Record<string, unknown> }) {
  await tx.outboxEvent.createMany({ data: [{ ...e, payload: e.payload as object }], skipDuplicates: true });
}

async function audit(tx: Tx, a: { articleId: string; versionId?: string | null; actor: Editor; action: string; from?: string; to?: string; note?: string | null }) {
  await tx.editorialAction.create({
    data: { articleId: a.articleId, versionId: a.versionId ?? null, actor: a.actor.user, action: a.action, fromStatus: a.from ?? null, toStatus: a.to ?? null, note: a.note?.slice(0, 2000) ?? null },
  });
}

export async function listEditorialQueue(status?: string) {
  const articles = await prisma.article.findMany({
    where: status ? { status } : { status: { in: ['DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'GENERATED', 'VALIDATED'] } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { story: { select: { storyType: true, primaryEntity: true, _count: { select: { sources: true } } } } },
  });
  const versionIds = articles.map((a) => a.currentVersionId).filter((x): x is string => Boolean(x));
  const versions = await prisma.articleVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, version: true, headline: true, validationReport: true, createdAt: true } });
  const byId = new Map(versions.map((v) => [v.id, v]));
  return articles.map((a) => {
    const v = a.currentVersionId ? byId.get(a.currentVersionId) : undefined;
    const report = (v?.validationReport ?? null) as { issues?: Array<{ severity: string; message: string }> } | null;
    return {
      id: a.id,
      slug: a.slug,
      status: a.status,
      category: a.category,
      headline: v?.headline ?? a.slug,
      version: v?.version ?? null,
      sources: a.story?._count.sources ?? 0,
      storyType: a.story?.storyType ?? null,
      primaryEntity: a.story?.primaryEntity ?? null,
      errors: report?.issues?.filter((i) => i.severity === 'error').map((i) => i.message) ?? [],
      isLive: Boolean(a.publishedVersionId),
      updatedAt: a.updatedAt,
    };
  });
}

export async function getEditorialArticle(id: string) {
  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: 'desc' }, include: { citations: { orderBy: { position: 'asc' } } } },
      actions: { orderBy: { createdAt: 'desc' }, take: 50 },
      story: {
        include: {
          claims: { orderBy: { createdAt: 'asc' } },
          sources: {
            orderBy: { createdAt: 'asc' },
            include: {
              sourceArticle: {
                select: {
                  id: true,
                  publisher: true,
                  canonicalUrl: true,
                  originalUrl: true,
                  headline: true,
                  language: true,
                  publishedAt: true,
                  bodyText: true,
                  state: true,
                  stateReason: true,
                  source: { select: { name: true, country: true, trustStatus: true } },
                  translations: { orderBy: { createdAt: 'desc' }, take: 1 },
                  extractions: { orderBy: { createdAt: 'desc' }, take: 1, select: { validationStatus: true, overallConfidence: true, model: true, promptVersion: true, errors: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return article;
}

async function loadForAction(tx: Tx, id: string) {
  const article = await tx.article.findUnique({ where: { id } });
  if (!article) throw new EditorialError('Article not found', 404);
  return article;
}

function transition(from: string, to: ArticleStatus) {
  if (!canTransition(from as ArticleStatus, to)) throw new EditorialError(`Cannot move an article from ${from} to ${to}`);
}

export async function approveArticle(id: string, versionId: string, actor: Editor, note?: string) {
  return prisma.$transaction(async (tx) => {
    const a = await loadForAction(tx, id);
    if (a.currentVersionId !== versionId) throw new EditorialError('A newer version exists; review the current version');
    if (a.status === 'NEEDS_REVIEW' && !note?.trim()) throw new EditorialError('Approving an article with open validation issues requires a note', 400);
    transition(a.status, 'APPROVED');
    await tx.article.update({ where: { id }, data: { status: 'APPROVED' } });
    await audit(tx, { articleId: id, versionId, actor, action: 'approve', from: a.status, to: 'APPROVED', note });
  });
}

export async function rejectArticle(id: string, actor: Editor, note: string) {
  if (!note?.trim()) throw new EditorialError('A rejection reason is required', 400);
  return prisma.$transaction(async (tx) => {
    const a = await loadForAction(tx, id);
    transition(a.status, 'REJECTED');
    await tx.article.update({ where: { id }, data: { status: 'REJECTED' } });
    await audit(tx, { articleId: id, versionId: a.currentVersionId, actor, action: 'reject', from: a.status, to: 'REJECTED', note });
  });
}

export async function archiveArticle(id: string, actor: Editor, note?: string) {
  return prisma.$transaction(async (tx) => {
    const a = await loadForAction(tx, id);
    transition(a.status, 'ARCHIVED');
    await tx.article.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await audit(tx, { articleId: id, versionId: a.publishedVersionId, actor, action: 'archive', from: a.status, to: 'ARCHIVED', note });
  });
}

/** Request publication. The publishing service performs the gated, idempotent publish. */
export async function requestPublish(id: string, versionId: string, actor: Editor) {
  return prisma.$transaction(async (tx) => {
    const a = await loadForAction(tx, id);
    if (a.status !== 'APPROVED') throw new EditorialError('Only approved articles can be published');
    if (a.currentVersionId !== versionId) throw new EditorialError('Only the current version can be published');
    await emit(tx, {
      stage: STAGES.PUBLISH,
      // Unique per request: the publish itself is idempotent (re-publishing a live version is a no-op).
      idempotencyKey: `${STAGES.PUBLISH}:${versionId}:${actor.user}:${Date.now()}`,
      correlationId: `editorial:${id}`,
      subjectType: 'article_version',
      subjectId: versionId,
      payload: { articleId: id, versionId, actor: actor.user, mode: 'manual' },
    });
    await audit(tx, { articleId: id, versionId, actor, action: 'publish_requested', from: a.status, to: a.status });
  });
}

/**
 * Editor edits create a NEW immutable version (history is preserved) and send it back
 * through validation. The deterministic Sources section is re-appended from citations.
 */
export async function editArticle(
  id: string,
  actor: Editor,
  patch: { headline?: string; seoTitle?: string; metaDescription?: string; intro?: string; bodyMarkdown?: string },
) {
  return prisma.$transaction(async (tx) => {
    const a = await loadForAction(tx, id);
    if (!a.currentVersionId) throw new EditorialError('Article has no version to edit');
    if (['REJECTED', 'ARCHIVED'].includes(a.status)) throw new EditorialError(`Cannot edit a ${a.status.toLowerCase()} article`);
    const cur = await tx.articleVersion.findUniqueOrThrow({ where: { id: a.currentVersionId }, include: { citations: true } });
    const body = (patch.bodyMarkdown ?? cur.bodyMarkdown.split(/\n## Sources\n/)[0]).split(/\n## Sources\n/)[0].trimEnd();
    const citations = cur.citations.map((c) => ({ ...c, sourceArticleId: c.sourceArticleId }));
    const next = {
      headline: patch.headline ?? cur.headline,
      seoTitle: patch.seoTitle ?? cur.seoTitle,
      metaDescription: patch.metaDescription ?? cur.metaDescription,
      intro: patch.intro ?? cur.intro,
      bodyMarkdown: `${body}\n\n${renderSources(citations)}`,
    };
    const contentHash = versionContentHash({ ...next, featuredImage: cur.featuredImage });
    if (contentHash === cur.contentHash) return { versionId: cur.id, changed: false };
    const last = await tx.articleVersion.findFirst({ where: { articleId: id }, orderBy: { version: 'desc' }, select: { version: true } });
    const v = await tx.articleVersion.create({
      data: {
        articleId: id,
        version: (last?.version ?? 0) + 1,
        contentHash,
        ...next,
        keyTakeaways: cur.keyTakeaways as object,
        whatThisMeans: cur.whatThisMeans,
        faq: (cur.faq ?? undefined) as object | undefined,
        socialSummary: cur.socialSummary,
        internalLinks: (cur.internalLinks ?? undefined) as object | undefined,
        featuredImage: (cur.featuredImage ?? undefined) as object | undefined,
        generator: { ...(cur.generator as object), editedFrom: cur.id, editedBy: actor.user },
        createdBy: actor.user,
      },
    });
    await tx.articleCitation.createMany({
      data: cur.citations.map((c) => ({ versionId: v.id, sourceArticleId: c.sourceArticleId, position: c.position, publisher: c.publisher, url: c.url, title: c.title, language: c.language, publishedAt: c.publishedAt })),
    });
    await tx.article.update({ where: { id }, data: { currentVersionId: v.id, status: 'GENERATED' } });
    await audit(tx, { articleId: id, versionId: v.id, actor, action: 'edit', from: a.status, to: 'GENERATED', note: `v${v.version}` });
    await emit(tx, {
      stage: STAGES.VALIDATE,
      idempotencyKey: `${STAGES.VALIDATE}:${v.id}`,
      correlationId: `editorial:${id}`,
      subjectType: 'article_version',
      subjectId: v.id,
      payload: { articleId: id, versionId: v.id },
    });
    return { versionId: v.id, changed: true };
  });
}

/** Resolve a POSSIBLE_DUPLICATE story: keep it separate, or merge it into another story. */
export async function resolvePossibleDuplicate(storyId: string, actor: Editor, action: 'keep' | 'merge', targetStoryId?: string) {
  return prisma.$transaction(async (tx) => {
    const story = await tx.story.findUnique({ where: { id: storyId }, include: { sources: true } });
    if (!story || story.status !== 'NEEDS_REVIEW') throw new EditorialError('Story is not awaiting duplicate review');
    const revision = `editor-${Date.now()}`;
    if (action === 'keep') {
      await tx.story.update({ where: { id: storyId }, data: { status: 'ACTIVE' } });
      await tx.storySource.updateMany({ where: { storyId }, data: { decision: 'UNIQUE' } });
      await tx.sourceArticle.updateMany({ where: { id: { in: story.sources.map((s) => s.sourceArticleId) } }, data: { state: 'DEDUPED', stateReason: `kept_separate_by:${actor.user}` } });
      await emit(tx, { stage: STAGES.GENERATE, idempotencyKey: `${STAGES.GENERATE}:${storyId}:${revision}`, correlationId: `editorial:${storyId}`, subjectType: 'story', subjectId: storyId, payload: { storyId, revision } });
      return;
    }
    if (!targetStoryId) throw new EditorialError('targetStoryId is required to merge', 400);
    const target = await tx.story.findUnique({ where: { id: targetStoryId } });
    if (!target || target.status !== 'ACTIVE') throw new EditorialError('Target story not found or not active', 404);
    await tx.storySource.updateMany({ where: { storyId }, data: { storyId: targetStoryId, role: 'SUPPORTING', decision: 'SAME_STORY', contributedFacts: true } });
    const claims = await tx.storyClaim.findMany({ where: { storyId } });
    for (const c of claims) {
      const exists = await tx.storyClaim.findUnique({ where: { storyId_claimKey: { storyId: targetStoryId, claimKey: c.claimKey } } });
      if (!exists) await tx.storyClaim.update({ where: { id: c.id }, data: { storyId: targetStoryId } });
    }
    await tx.story.update({ where: { id: storyId }, data: { status: 'MERGED' } });
    await tx.sourceArticle.updateMany({ where: { id: { in: story.sources.map((s) => s.sourceArticleId) } }, data: { state: 'DEDUPED', stateReason: `merged_into:${targetStoryId}` } });
    await emit(tx, { stage: STAGES.GENERATE, idempotencyKey: `${STAGES.GENERATE}:${targetStoryId}:${revision}`, correlationId: `editorial:${targetStoryId}`, subjectType: 'story', subjectId: targetStoryId, payload: { storyId: targetStoryId, revision } });
  });
}

/** Source articles stopped for review (invalid extraction, translation issues, possible duplicates). */
export async function listSourceReviews() {
  return prisma.sourceArticle.findMany({
    where: { state: 'NEEDS_REVIEW' },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      publisher: true,
      headline: true,
      language: true,
      canonicalUrl: true,
      stateReason: true,
      updatedAt: true,
      storySource: { select: { storyId: true, reasons: true } },
      translations: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, headline: true, summary: true, validation: true } },
      extractions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, validationStatus: true, errors: true } },
    },
  });
}

/**
 * retry: discard the rejected extraction/translation and run the stage again.
 * accept_translation: an editor verified the translation manually; continue to dedup.
 * reject: drop the source article from the pipeline.
 */
export async function resolveSourceReview(sourceArticleId: string, actor: Editor, action: 'retry' | 'accept_translation' | 'reject') {
  return prisma.$transaction(async (tx) => {
    const sa = await tx.sourceArticle.findUnique({
      where: { id: sourceArticleId },
      include: { translations: { orderBy: { createdAt: 'desc' }, take: 1 }, extractions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!sa || sa.state !== 'NEEDS_REVIEW') throw new EditorialError('Source article is not awaiting review');
    const at = Date.now();
    if (action === 'reject') {
      await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'REJECTED', stateReason: `rejected_by:${actor.user}` } });
      return;
    }
    const tr = sa.translations[0];
    if (action === 'accept_translation') {
      if (!tr || tr.status !== 'NEEDS_REVIEW' || !tr.headline) throw new EditorialError('No translation awaiting review');
      await tx.translation.update({ where: { id: tr.id }, data: { status: 'VALID', validation: { acceptedBy: actor.user, at: new Date(at).toISOString(), previous: tr.validation as object } } });
      await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'STRUCTURED', stateReason: null } });
      await emit(tx, { stage: STAGES.DEDUPE, idempotencyKey: `${STAGES.DEDUPE}:${sa.id}:editor:${at}`, correlationId: sa.correlationId, subjectType: 'source_article', subjectId: sa.id, payload: { sourceArticleId: sa.id } });
      return;
    }
    // retry
    const fx = sa.extractions[0];
    if (fx && fx.validationStatus !== 'VALID') {
      await tx.factExtraction.delete({ where: { id: fx.id } });
      await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'NORMALIZED', stateReason: null } });
      await emit(tx, { stage: STAGES.EXTRACT, idempotencyKey: `${STAGES.EXTRACT}:${sa.id}:retry:${at}`, correlationId: sa.correlationId, subjectType: 'source_article', subjectId: sa.id, payload: { sourceArticleId: sa.id } });
      return;
    }
    if (tr && tr.status !== 'VALID') {
      await tx.translation.delete({ where: { id: tr.id } });
      await tx.sourceArticle.update({ where: { id: sa.id }, data: { state: 'STRUCTURED', stateReason: null } });
      await emit(tx, {
        stage: STAGES.TRANSLATE,
        idempotencyKey: `${STAGES.TRANSLATE}:${sa.id}:retry:${at}`,
        correlationId: sa.correlationId,
        subjectType: 'source_article',
        subjectId: sa.id,
        payload: { sourceArticleId: sa.id, targetLanguage: tr.targetLanguage },
      });
      return;
    }
    throw new EditorialError('Nothing to retry for this source article (resolve possible duplicates on the story instead)');
  });
}

// ---------------------------------------------------------------------------
// Dead-letter queue
// ---------------------------------------------------------------------------

export async function listJobs(status = 'DEAD_LETTER', stage?: string) {
  return prisma.pipelineJob.findMany({
    where: { status, ...(stage ? { stage } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, stage: true, status: true, attempts: true, maxAttempts: true, replayCount: true, correlationId: true, subjectType: true, subjectId: true, lastError: true, createdAt: true, updatedAt: true, idempotencyKey: true },
  });
}

export async function jobCounts() {
  const rows = await prisma.pipelineJob.groupBy({ by: ['stage', 'status'], _count: { _all: true } });
  return rows.map((r) => ({ stage: r.stage, status: r.status, count: r._count._all }));
}

function redisConnection() {
  const u = new URL(process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password ? decodeURIComponent(u.password) : process.env.REDIS_PASSWORD || undefined, db: Number(u.pathname.slice(1) || 0) };
}

/** Replay a dead-lettered job with the SAME idempotency key (handlers are upsert-based: no duplicates). */
export async function replayJob(id: string, actor: Editor) {
  const res = await prisma.pipelineJob.updateMany({
    where: { id, status: 'DEAD_LETTER' },
    data: { status: 'QUEUED', attempts: 0, replayCount: { increment: 1 }, completedAt: null, nextRunAt: null },
  });
  if (res.count === 0) throw new EditorialError('Job is not dead-lettered');
  const job = await prisma.pipelineJob.findUniqueOrThrow({ where: { id } });
  const queue = new Queue(queueName(job.stage as Stage), { connection: redisConnection(), prefix: process.env.BULLMQ_PREFIX || 'lf' });
  try {
    await queue.add(
      job.stage,
      { idempotencyKey: job.idempotencyKey, correlationId: job.correlationId, stage: job.stage, subjectType: job.subjectType, subjectId: job.subjectId, payload: job.payload },
      { jobId: bullJobId(job.idempotencyKey, job.replayCount), attempts: 100, backoff: { type: 'pipeline' }, removeOnComplete: { age: 86400 } },
    );
  } finally {
    await queue.close();
  }
  console.info(JSON.stringify({ msg: 'job replayed', jobId: id, stage: job.stage, by: actor.user }));
  return job;
}
