import 'server-only';
import { prisma } from './prisma';

const PUBLIC_WHERE = { publishedVersionId: { not: null }, status: { notIn: ['ARCHIVED', 'REJECTED'] } };

function startOfTodayIST(now = new Date()): Date {
  // The newsroom runs on India time; "today" means since midnight IST.
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000);
}

export async function articleStats() {
  const today = startOfTodayIST();
  const week = new Date(Date.now() - 7 * 86400_000);
  const [publishedToday, publishedWeek, total] = await Promise.all([
    prisma.article.count({ where: { ...PUBLIC_WHERE, publishedAt: { gte: today } } }),
    prisma.article.count({ where: { ...PUBLIC_WHERE, publishedAt: { gte: week } } }),
    prisma.article.count({ where: PUBLIC_WHERE }),
  ]);
  return { publishedToday, publishedWeek, total };
}

export async function recentPublished(take = 20) {
  const rows = await prisma.article.findMany({
    where: PUBLIC_WHERE,
    orderBy: { publishedAt: 'desc' },
    take,
    select: { id: true, slug: true, category: true, status: true, publishedAt: true, publishedVersionId: true },
  });
  const versionIds = rows.map((r) => r.publishedVersionId).filter((x): x is string => Boolean(x));
  const versions = await prisma.articleVersion.findMany({
    where: { id: { in: versionIds } },
    select: { id: true, headline: true, citations: { select: { publisher: true }, orderBy: { position: 'asc' }, take: 1 } },
  });
  const byId = new Map(versions.map((v) => [v.id, v]));
  return rows.map((r) => {
    const v = r.publishedVersionId ? byId.get(r.publishedVersionId) : undefined;
    return {
      id: r.id,
      slug: r.slug,
      title: v?.headline ?? r.slug,
      category: r.category ?? '—',
      status: r.status,
      publishedAt: r.publishedAt,
      source: v?.citations[0]?.publisher ?? '—',
    };
  });
}

/** Pipeline activity over the last 24 hours, from the durable job and article tables. */
export async function pipelineStats() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [discovered, processed, skipped, published, failed, retrying, running, lastSuccess, lastFailure, lastCrawl] = await Promise.all([
    prisma.sourceArticle.count({ where: { fetchedAt: { gte: since } } }),
    prisma.sourceArticle.count({ where: { fetchedAt: { gte: since }, state: { notIn: ['DISCOVERED'] } } }),
    prisma.sourceArticle.count({ where: { fetchedAt: { gte: since }, state: { in: ['REJECTED', 'ARCHIVED'] } } }),
    prisma.article.count({ where: { ...PUBLIC_WHERE, publishedAt: { gte: since } } }),
    prisma.pipelineJob.count({ where: { status: 'DEAD_LETTER', updatedAt: { gte: since } } }),
    prisma.pipelineJob.count({ where: { status: 'RETRY_PENDING' } }),
    prisma.pipelineJob.count({ where: { status: 'RUNNING' } }),
    prisma.pipelineJob.findFirst({ where: { status: 'SUCCEEDED' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true, stage: true } }),
    prisma.pipelineJob.findFirst({
      where: { status: { in: ['DEAD_LETTER', 'RETRY_PENDING'] } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, stage: true, lastError: true },
    }),
    prisma.crawlRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true, status: true } }),
  ]);

  const lastErrorMessage = (() => {
    const e = lastFailure?.lastError as { message?: string } | string | null | undefined;
    if (!e) return null;
    return (typeof e === 'string' ? e : e.message ?? JSON.stringify(e)).slice(0, 240);
  })();

  const lastSuccessAt = lastSuccess?.completedAt ?? null;
  const stale = !lastSuccessAt || Date.now() - lastSuccessAt.getTime() > 6 * 3600_000;
  const status = running > 0 ? 'running' : stale ? 'stalled' : 'idle';

  return {
    discovered,
    processed,
    skipped,
    published,
    failed,
    retrying,
    running,
    status,
    lastSuccessAt,
    lastSuccessStage: lastSuccess?.stage ?? null,
    lastCrawlAt: lastCrawl?.startedAt ?? null,
    lastCrawlStatus: lastCrawl?.status ?? null,
    lastError: lastFailure ? { at: lastFailure.updatedAt, stage: lastFailure.stage, message: lastErrorMessage } : null,
  };
}

export async function emailStats() {
  const today = startOfTodayIST();
  const week = new Date(Date.now() - 7 * 86400_000);
  const [total, todayCount, weekCount, byLocation, attempts, failed] = await Promise.all([
    prisma.emailSignup.count(),
    prisma.emailSignup.count({ where: { createdAt: { gte: today } } }),
    prisma.emailSignup.count({ where: { createdAt: { gte: week } } }),
    prisma.emailSignup.groupBy({ by: ['signupLocation'], _count: { _all: true } }),
    prisma.emailSignup.aggregate({ _sum: { attempts: true } }),
    prisma.siteError.aggregate({ where: { type: 'email_capture' }, _sum: { count: true } }),
  ]);
  return {
    total,
    today: todayCount,
    week: weekCount,
    byLocation: byLocation.map((g) => ({ location: g.signupLocation, count: g._count._all })).sort((a, b) => b.count - a.count),
    duplicateAttempts: (attempts._sum.attempts ?? 0) - total,
    failedSubmissions: failed._sum.count ?? 0,
  };
}

export async function recentSiteErrors(take = 50) {
  return prisma.siteError.findMany({ orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { lastSeenAt: 'desc' }], take });
}
