import { prisma } from '@/lib/prisma';

/**
 * Read model for the Pipeline Monitor (/admin/pipeline). Everything comes from the durable
 * tables (pipeline_jobs, crawl_runs, source_articles, articles), so it covers every service
 * and replica without depending on log files.
 */

/** Stage order as items flow through the pipeline (translate only runs when needed). */
export const STAGE_FLOW = [
  { stage: 'discover.source', label: 'Discover', hint: 'Scan feeds and sitemaps' },
  { stage: 'article.scrape', label: 'Scrape', hint: 'Fetch page or feed text' },
  { stage: 'article.normalize', label: 'Normalize', hint: 'Clean text, hash, language' },
  { stage: 'article.extract', label: 'Extract', hint: 'Claude fact extraction' },
  { stage: 'article.translate', label: 'Translate', hint: 'Only non-English facts' },
  { stage: 'story.dedupe', label: 'Dedupe', hint: 'Group into stories' },
  { stage: 'article.generate', label: 'Generate', hint: 'Write the story' },
  { stage: 'article.validate', label: 'Validate', hint: 'Grounding, SEO, safety' },
  { stage: 'article.publish', label: 'Publish', hint: 'Gated publish' },
] as const;

export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'RETRY_PENDING', 'SUCCEEDED', 'DEAD_LETTER'] as const;

export type Window = '1h' | '24h' | '7d' | 'all';
export const WINDOWS: Window[] = ['1h', '24h', '7d', 'all'];

export function windowStart(w: Window): Date | undefined {
  const hours = { '1h': 1, '24h': 24, '7d': 24 * 7, all: 0 }[w];
  return hours ? new Date(Date.now() - hours * 3600_000) : undefined;
}

type JobError = { code?: string; message?: string; retryable?: boolean; at?: string } | null;

function jobError(v: unknown): JobError {
  return v && typeof v === 'object' ? (v as JobError) : null;
}

/** Collapse ids so identical failures group together. */
function errorSignature(message: string): string {
  return message
    .replace(/req_[a-z0-9]+/gi, 'req_…')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '…')
    .replace(/https?:\/\/\S+/g, '<url>')
    .slice(0, 180);
}

export async function stageSummary(since?: Date) {
  const where = since ? { updatedAt: { gte: since } } : {};
  const [groups, outboxPending] = await Promise.all([
    prisma.pipelineJob.groupBy({ by: ['stage', 'status'], where, _count: { _all: true } }),
    prisma.outboxEvent.count({ where: { dispatchedAt: null } }),
  ]);
  const byStage = STAGE_FLOW.map((s) => {
    const counts = Object.fromEntries(JOB_STATUSES.map((st) => [st, 0])) as Record<(typeof JOB_STATUSES)[number], number>;
    for (const g of groups) if (g.stage === s.stage && g.status in counts) counts[g.status as keyof typeof counts] = g._count._all;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { ...s, counts, total };
  });
  return { byStage, outboxPending };
}

export async function contentSummary() {
  const [sourceStates, articleStates, published] = await Promise.all([
    prisma.sourceArticle.groupBy({ by: ['state'], _count: { _all: true } }),
    prisma.article.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.article.count({ where: { publishedVersionId: { not: null } } }),
  ]);
  return {
    sourceStates: sourceStates.map((s) => ({ state: s.state, count: s._count._all })).sort((a, b) => b.count - a.count),
    articleStates: articleStates.map((s) => ({ status: s.status, count: s._count._all })).sort((a, b) => b.count - a.count),
    sourceArticles: sourceStates.reduce((a, s) => a + s._count._all, 0),
    published,
  };
}

export async function errorGroups(since?: Date) {
  const jobs = await prisma.pipelineJob.findMany({
    where: { status: { in: ['DEAD_LETTER', 'RETRY_PENDING'] }, ...(since ? { updatedAt: { gte: since } } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 2000,
    select: { id: true, stage: true, status: true, lastError: true, updatedAt: true },
  });
  const groups = new Map<string, { stage: string; code: string; message: string; count: number; deadLetters: number; lastSeen: Date; sampleJobId: string }>();
  for (const j of jobs) {
    const err = jobError(j.lastError);
    const message = errorSignature(err?.message ?? 'unknown error');
    const key = `${j.stage}|${err?.code ?? ''}|${message}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (j.status === 'DEAD_LETTER') g.deadLetters++;
    } else {
      groups.set(key, { stage: j.stage, code: err?.code ?? 'unknown', message, count: 1, deadLetters: j.status === 'DEAD_LETTER' ? 1 : 0, lastSeen: j.updatedAt, sampleJobId: j.id });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export async function sourceHealth() {
  const [sources, articleCounts, runs] = await Promise.all([
    prisma.source.findMany({ where: { registryKey: { not: null } }, orderBy: [{ enabled: 'desc' }, { name: 'asc' }] }),
    prisma.sourceArticle.groupBy({ by: ['sourceId'], _count: { _all: true } }),
    prisma.crawlRun.findMany({ orderBy: { startedAt: 'desc' }, take: 300, select: { sourceId: true, status: true, startedAt: true, newUrls: true, updatedUrls: true, errorCount: true } }),
  ]);
  const counts = new Map(articleCounts.map((c) => [c.sourceId, c._count._all]));
  const lastRun = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!lastRun.has(r.sourceId)) lastRun.set(r.sourceId, r);
  return sources.map((s) => ({
    id: s.id,
    key: s.registryKey!,
    name: s.name,
    country: s.country,
    language: s.defaultLanguage,
    trustStatus: s.trustStatus,
    enabled: s.enabled,
    failureStatus: s.failureStatus,
    consecutiveFailures: s.consecutiveFailures,
    lastError: s.lastError,
    lastSuccessfulScanAt: s.lastSuccessfulScanAt,
    lastChangeDetectedAt: s.lastChangeDetectedAt,
    crawlIntervalMinutes: s.crawlIntervalMinutes,
    articles: counts.get(s.id) ?? 0,
    lastRun: lastRun.get(s.id) ?? null,
  }));
}

export async function recentCrawlRuns(take = 12) {
  return prisma.crawlRun.findMany({
    orderBy: { startedAt: 'desc' },
    take,
    include: { source: { select: { name: true, registryKey: true } } },
  });
}

/**
 * Event log: the latest job transitions, newest first, with the item each job worked on
 * (headline for article jobs, source name for scans).
 */
export async function eventLog(opts: { stage?: string; status?: string; sourceId?: string; take?: number; since?: Date }) {
  const jobs = await prisma.pipelineJob.findMany({
    where: {
      ...(opts.stage ? { stage: opts.stage } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.sourceId ? { correlationId: { contains: opts.sourceId } } : {}),
      ...(opts.since ? { updatedAt: { gte: opts.since } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: opts.take ?? 60,
  });
  const subjectIds = [...new Set(jobs.map((j) => j.subjectId))];
  const [articles, urlStates, sources] = await Promise.all([
    prisma.sourceArticle.findMany({ where: { OR: [{ id: { in: subjectIds } }, { urlStateId: { in: subjectIds } }] }, select: { id: true, urlStateId: true, headline: true, publisher: true } }),
    prisma.urlState.findMany({ where: { id: { in: subjectIds } }, select: { id: true, url: true } }),
    prisma.source.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }),
  ]);
  const articleBySubject = new Map<string, (typeof articles)[number]>();
  for (const a of articles) {
    articleBySubject.set(a.id, a);
    if (a.urlStateId) articleBySubject.set(a.urlStateId, a);
  }
  const urlById = new Map(urlStates.map((u) => [u.id, u.url]));
  const sourceById = new Map(sources.map((s) => [s.id, s.name]));
  return jobs.map((j) => {
    const art = articleBySubject.get(j.subjectId);
    return {
      id: j.id,
      stage: j.stage,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      updatedAt: j.updatedAt,
      durationMs: j.startedAt && j.completedAt ? j.completedAt.getTime() - j.startedAt.getTime() : null,
      error: jobError(j.lastError),
      correlationId: j.correlationId,
      subjectType: j.subjectType,
      itemId: art?.id ?? null,
      label: art?.headline ?? sourceById.get(j.subjectId) ?? urlById.get(j.subjectId) ?? `${j.subjectType}:${j.subjectId.slice(0, 8)}`,
      publisher: art?.publisher ?? null,
    };
  });
}

/** Latest source articles with the status of each stage they went through. */
export async function recentItems(take = 15) {
  const items = await prisma.sourceArticle.findMany({
    orderBy: { updatedAt: 'desc' },
    take,
    select: { id: true, urlStateId: true, headline: true, publisher: true, state: true, stateReason: true, updatedAt: true, storySource: { select: { storyId: true } } },
  });
  const subjectIds = items.flatMap((i) => [i.id, i.urlStateId, i.storySource?.storyId].filter((x): x is string => Boolean(x)));
  const jobs = await prisma.pipelineJob.findMany({ where: { subjectId: { in: subjectIds } }, select: { stage: true, status: true, subjectId: true } });
  return items.map((i) => {
    const ids = new Set([i.id, i.urlStateId, i.storySource?.storyId].filter(Boolean));
    const stages: Record<string, string> = {};
    for (const j of jobs) if (ids.has(j.subjectId)) stages[j.stage] = j.status;
    return { ...i, stages };
  });
}

/** Everything known about one source article, in pipeline order. */
export async function itemTrace(id: string) {
  const item = await prisma.sourceArticle.findUnique({
    where: { id },
    include: {
      source: { select: { name: true, registryKey: true } },
      extractions: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, model: true, validationStatus: true, overallConfidence: true, createdAt: true, errors: true } },
      translations: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, targetLanguage: true, status: true, createdAt: true } },
      storySource: { include: { story: { include: { article: { select: { id: true, slug: true, status: true, publishedVersionId: true, currentVersionId: true } } } } } },
    },
  });
  if (!item) return null;
  const story = item.storySource?.story ?? null;
  const article = story?.article ?? null;
  const versionIds = article ? (await prisma.articleVersion.findMany({ where: { articleId: article.id }, select: { id: true } })).map((v) => v.id) : [];
  const subjectIds = [item.id, item.urlStateId, story?.id, article?.id, ...versionIds].filter((x): x is string => Boolean(x));
  const jobs = await prisma.pipelineJob.findMany({ where: { subjectId: { in: subjectIds } }, orderBy: { createdAt: 'asc' } });
  const order: string[] = STAGE_FLOW.map((s) => s.stage);
  jobs.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.createdAt.getTime() - b.createdAt.getTime());
  return {
    item,
    story,
    article,
    jobs: jobs.map((j) => ({
      id: j.id,
      stage: j.stage,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      replayCount: j.replayCount,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      updatedAt: j.updatedAt,
      nextRunAt: j.nextRunAt,
      correlationId: j.correlationId,
      error: jobError(j.lastError),
    })),
  };
}
