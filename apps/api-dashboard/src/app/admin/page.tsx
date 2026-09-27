import React from 'react';
import Link from 'next/link';
import { SITE_URL } from '@/lib/articles';
import { articleStats, emailStats, pipelineStats, recentPublished, recentSiteErrors } from '@/lib/admin-overview';
import { probeRoutes, siteHealth } from '@/lib/health';
import { analyticsSnapshot, ga4Configured, type AnalyticsSnapshot } from '@/lib/ga4';
import { categoryForArticle } from '@/lib/topics';
import { CONTACTS_CONFIRMED } from '@/lib/site-contacts';
import { CopyUrlButton } from './_components/CopyUrlButton';
import { ResolveErrorButton } from './_components/ResolveErrorButton';

/**
 * Monitoring only: what was published, whether the pipeline and site are
 * healthy, the email list, reader analytics and recent errors. Editing,
 * publishing and retries live on the dedicated admin pages.
 */
export const dynamic = 'force-dynamic';

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };

function when(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', IST) + ' IST';
}

function ago(d: Date | string | null | undefined): string {
  if (!d) return 'never';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

function Card({ label, value, sub, tone = 'default' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const color = {
    default: 'text-slate-900 dark:text-white',
    good: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-400',
    bad: 'text-rose-700 dark:text-rose-400',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#121820]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#121820]">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-white/5">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Status({ ok, label }: { ok: boolean | null; label?: string }) {
  const cls = ok === null ? 'bg-slate-200 text-slate-700' : ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label ?? (ok === null ? 'n/a' : ok ? 'OK' : 'Down')}</span>;
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function AdminOverview() {
  const [articles, recent, pipeline, email, errors, health, probes, analytics] = await Promise.all([
    articleStats(),
    recentPublished(20),
    pipelineStats(),
    settle(emailStats()),
    recentSiteErrors(50),
    siteHealth(),
    probeRoutes(),
    ga4Configured() ? settle<AnalyticsSnapshot>(analyticsSnapshot()) : Promise.resolve(null),
  ]);

  const openErrors = errors.filter((e) => !e.resolvedAt);
  const siteOk = health.status !== 'down' && probes.every((p) => p.status !== null && p.status < 500);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Checked {when(health.checkedAt)}. Monitoring only; publishing and retries are on the pages in the sidebar.</p>
      </div>

      {!CONTACTS_CONFIRMED ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          The trust pages still show placeholder contact addresses. Update <code>src/lib/site-contacts.ts</code> and{' '}
          <code>public/.well-known/security.txt</code>, then set <code>CONTACTS_CONFIRMED</code> to true.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Card label="Published today" value={articles.publishedToday} sub={`${articles.publishedWeek} in 7 days`} />
        <Card label="Total published" value={articles.total} />
        <Card
          label="Pipeline"
          value={pipeline.status}
          tone={pipeline.status === 'stalled' ? 'bad' : 'good'}
          sub={`Last success ${ago(pipeline.lastSuccessAt)}`}
        />
        <Card label="Failed jobs (24h)" value={pipeline.failed} tone={pipeline.failed > 0 ? 'warn' : 'good'} sub={`${pipeline.retrying} waiting to retry`} />
        <Card
          label="Email signups"
          value={email.ok ? email.value.today : '—'}
          sub={email.ok ? `today · ${email.value.total} total` : 'unavailable'}
        />
        <Card label="Site health" value={siteOk ? health.status : 'down'} tone={!siteOk ? 'bad' : health.status === 'ok' ? 'good' : 'warn'} />
        <Card label="Sitemap generated" value={ago(health.sitemapGeneratedAt)} sub={when(health.sitemapGeneratedAt)} />
        <Card label="Open errors" value={openErrors.length} tone={openErrors.length ? 'warn' : 'good'} sub={`Latest ${ago(health.latestErrorAt)}`} />
      </div>

      <Panel
        title="Recently published"
        action={
          <Link href="/" className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
            View site →
          </Link>
        }
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Published</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {recent.map((a) => {
                const url = `${SITE_URL}/news/${a.slug}`;
                return (
                  <tr key={a.id}>
                    <td className="max-w-md px-5 py-3 font-medium">
                      <span className="line-clamp-2">{a.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{categoryForArticle(a.category).label}</td>
                    <td className="whitespace-nowrap px-5 py-3">{when(a.publishedAt)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{a.source}</td>
                    <td className="whitespace-nowrap px-5 py-3">{a.status}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="flex gap-3">
                        <a href={`/news/${a.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">
                          Open
                        </a>
                        <CopyUrlButton url={url} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-600">
                    Nothing published yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel
          title="Pipeline (last 24h)"
          action={
            <Link href="/admin/pipeline" className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
              Pipeline monitor →
            </Link>
          }
        >
          <Row label="Last run" value={`${when(pipeline.lastCrawlAt)}${pipeline.lastCrawlStatus ? ` · ${pipeline.lastCrawlStatus}` : ''}`} />
          <Row label="Last successful job" value={`${when(pipeline.lastSuccessAt)}${pipeline.lastSuccessStage ? ` · ${pipeline.lastSuccessStage}` : ''}`} />
          <Row label="Stories discovered" value={pipeline.discovered} />
          <Row label="Stories processed" value={pipeline.processed} />
          <Row label="Stories published" value={pipeline.published} />
          <Row label="Stories skipped" value={pipeline.skipped} />
          <Row label="Failed (dead letter)" value={pipeline.failed} />
          <Row label="Waiting to retry" value={pipeline.retrying} />
          <Row label="Running now" value={pipeline.running} />
          {pipeline.lastError ? (
            <div className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-900 dark:bg-rose-500/10 dark:text-rose-200">
              <div className="font-semibold">
                Last error · {pipeline.lastError.stage} · {when(pipeline.lastError.at)}
              </div>
              <div className="mt-1 wrap-break-word">{pipeline.lastError.message ?? 'No message'}</div>
            </div>
          ) : null}
        </Panel>

        <Panel title="Website health">
          <Row label="Database" value={<Status ok={health.database} />} />
          <Row label="Redis" value={<Status ok={health.redis} />} />
          {probes.map((p) => (
            <Row
              key={p.path}
              label={`${p.name} (${p.path})`}
              value={
                <span className="flex items-center gap-2">
                  {p.ms !== null ? <span className="text-xs text-slate-500">{p.ms} ms</span> : null}
                  <Status ok={p.status !== null && p.status < 400} label={p.status === null ? 'No response' : String(p.status)} />
                </span>
              }
            />
          ))}
          <Row label="Email endpoint (table reachable)" value={<Status ok={email.ok} />} />
          <Row label="Sitemap generated" value={when(health.sitemapGeneratedAt)} />
          <Row label="Latest error" value={when(health.latestErrorAt)} />
        </Panel>

        <Panel title="Email list">
          {email.ok ? (
            <>
              <Row label="Total stored" value={email.value.total} />
              <Row label="Today" value={email.value.today} />
              <Row label="Last 7 days" value={email.value.week} />
              <Row label="Duplicate attempts" value={email.value.duplicateAttempts} />
              <Row label="Failed submissions" value={email.value.failedSubmissions} />
              <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">By signup location</div>
              {email.value.byLocation.length ? (
                email.value.byLocation.map((l) => <Row key={l.location} label={l.location} value={l.count} />)
              ) : (
                <p className="mt-2 text-sm text-slate-600">No signups yet.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-rose-700">Could not read the email table: {email.error}</p>
          )}
        </Panel>

        <Panel title="Analytics snapshot">
          {analytics === null ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              GA4 is not configured. Set <code>GA4_PROPERTY_ID</code> and <code>GA4_SERVICE_ACCOUNT_JSON</code> (base64 of a service-account key with Viewer
              access to the property).
            </p>
          ) : !analytics.ok ? (
            <p className="text-sm text-rose-700">GA4 request failed: {analytics.error}</p>
          ) : (
            <>
              <Row label="Users today" value={analytics.value.usersToday} />
              <Row label="Page views today" value={analytics.value.pageViewsToday} />
              <Row label="Searches (7 days)" value={analytics.value.searches} />
              <Row label="Article completion rate (7 days)" value={pct(analytics.value.completionRate)} />
              <Row label="Email conversion rate (7 days)" value={pct(analytics.value.emailConversionRate)} />
              <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Top articles today</div>
              {analytics.value.topArticles.length ? (
                analytics.value.topArticles.map((a) => (
                  <Row
                    key={a.path}
                    label={
                      <a href={a.path} target="_blank" rel="noopener noreferrer" className="line-clamp-1 hover:underline">
                        {a.title || a.path}
                      </a>
                    }
                    value={a.views}
                  />
                ))
              ) : (
                <p className="mt-2 text-sm text-slate-600">No article views yet today.</p>
              )}
              <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Top categories (reads, 7 days)</div>
              {analytics.value.topCategories.length ? (
                analytics.value.topCategories.map((c) => <Row key={c.category} label={c.category} value={c.reads} />)
              ) : (
                <p className="mt-2 text-sm text-slate-600">No data (register the event parameter “category” as a custom dimension in GA).</p>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel title="Errors">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Last seen</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Route / job</th>
                <th className="px-5 py-3 font-semibold">Message</th>
                <th className="px-5 py-3 font-semibold">Count</th>
                <th className="px-5 py-3 font-semibold">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {errors.map((e) => (
                <tr key={e.id} className={e.resolvedAt ? 'opacity-60' : ''}>
                  <td className="whitespace-nowrap px-5 py-3">{when(e.lastSeenAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">{e.type}</td>
                  <td className="max-w-56 break-all px-5 py-3 font-mono text-xs">{e.route}</td>
                  <td className="max-w-md px-5 py-3">
                    <span className="line-clamp-2 wrap-break-word">{e.message}</span>
                  </td>
                  <td className="px-5 py-3">{e.count}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="mr-3 text-xs">{e.resolvedAt ? 'Resolved' : 'Open'}</span>
                    <ResolveErrorButton id={e.id} resolved={Boolean(e.resolvedAt)} />
                  </td>
                </tr>
              ))}
              {errors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-600">
                    No errors recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
