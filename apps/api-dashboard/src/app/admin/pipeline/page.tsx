import React from 'react';
import Link from 'next/link';
import {
  JOB_STATUSES,
  STAGE_FLOW,
  WINDOWS,
  contentSummary,
  errorGroups,
  eventLog,
  recentCrawlRuns,
  recentItems,
  sourceHealth,
  stageSummary,
  windowStart,
  type Window,
} from '@/lib/pipeline-monitor';
import { AutoRefresh, ScanButton } from './controls';
import { STATUS_STYLE, StatusPill, ago, card } from './ui';

export const dynamic = 'force-dynamic';

function qs(current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/admin/pipeline?${s}` : '/admin/pipeline';
}

function Kpi({ label, value, tone = 'text-slate-900 dark:text-white', sub }: { label: string; value: React.ReactNode; tone?: string; sub?: string }) {
  return (
    <div className={`${card} p-5`}>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default async function PipelineMonitor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const win = (WINDOWS.includes(one('window') as Window) ? one('window') : '24h') as Window;
  const stage = STAGE_FLOW.some((s) => s.stage === one('stage')) ? one('stage') : undefined;
  const status = (JOB_STATUSES as readonly string[]).includes(one('status') ?? '') ? one('status') : undefined;
  const source = one('source');
  const current = { window: win === '24h' ? undefined : win, stage, status, source };
  const since = windowStart(win);

  const [flow, content, errors, sources, events, items, runs] = await Promise.all([
    stageSummary(since),
    contentSummary(),
    errorGroups(since),
    sourceHealth(),
    eventLog({ stage, status, sourceId: source, since, take: 60 }),
    recentItems(15),
    recentCrawlRuns(10),
  ]);

  const deadLetters = flow.byStage.reduce((a, s) => a + s.counts.DEAD_LETTER, 0);
  const inFlight = flow.byStage.reduce((a, s) => a + s.counts.QUEUED + s.counts.RUNNING + s.counts.RETRY_PENDING, 0);
  const activeSources = sources.filter((s) => s.enabled && s.trustStatus === 'APPROVED');
  // A stage is "blocked" when everything it touched in the window failed.
  const blocked = flow.byStage.filter((s) => s.counts.DEAD_LETTER + s.counts.RETRY_PENDING > 0 && s.counts.SUCCEEDED === 0);
  const topError = errors[0];
  const sourceName = source ? sources.find((s) => s.id === source)?.name : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Pipeline Monitor</h1>
          <p className="text-slate-500 text-sm">Every stage from source scan to published story, with errors and the job log. Data comes from the job tables, so it covers all services.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AutoRefresh seconds={10} />
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <Link key={w} href={qs(current, { window: w === '24h' ? undefined : w })} className={`px-3 py-1 rounded-full text-xs font-medium ${w === win ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-white/5'}`}>
                {w === 'all' ? 'All time' : `Last ${w}`}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {blocked.length > 0 && (
        <div className="rounded-2xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-5">
          <p className="font-semibold text-rose-700 dark:text-rose-300">
            Pipeline blocked at {blocked.map((b) => b.label).join(', ')}: nothing got through in this window.
          </p>
          {topError && (
            <p className="text-sm text-rose-700/80 dark:text-rose-300/80 mt-1 break-words">
              Most common error ({topError.count}×, {topError.stage}): <span className="font-mono">{topError.message}</span>
            </p>
          )}
          <p className="text-xs text-rose-700/70 dark:text-rose-300/70 mt-2">
            Fix the cause, then replay the dead letters from <Link href="/admin/jobs" className="underline">Jobs &amp; Dead Letters</Link>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Active sources" value={activeSources.length} sub={`of ${sources.length} in registry`} />
        <Kpi label="Articles collected" value={content.sourceArticles} sub="source articles, all time" />
        <Kpi label="Published stories" value={content.published} tone="text-teal-600 dark:text-teal-400" />
        <Kpi label="In flight" value={inFlight} tone="text-sky-600 dark:text-sky-400" sub={`${flow.outboxPending} events waiting in outbox`} />
        <Kpi label="Dead letters" value={deadLetters} tone={deadLetters ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'} sub={win === 'all' ? 'all time' : `last ${win}`} />
      </div>

      <section>
        <h2 className="text-lg font-bold mb-3">Workflow</h2>
        <div className="overflow-x-auto pb-2">
          <div className="flex items-stretch gap-2 min-w-max">
            {flow.byStage.map((s, i) => {
              const failing = s.counts.DEAD_LETTER > 0;
              const active = stage === s.stage;
              return (
                <React.Fragment key={s.stage}>
                  {i > 0 && <div className="self-center text-slate-400 select-none">→</div>}
                  <Link
                    href={qs(current, { stage: active ? undefined : s.stage })}
                    className={`${card} w-40 p-4 block hover:border-teal-400 transition-colors ${active ? 'ring-2 ring-teal-500' : ''} ${failing ? 'border-rose-300 dark:border-rose-500/50' : ''}`}
                  >
                    <div className="text-sm font-bold">{s.label}</div>
                    <div className="text-[11px] text-slate-500 mb-3 h-8 leading-tight">{s.hint}</div>
                    <div className="text-2xl font-bold tabular-nums mb-2">{s.total}</div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-white/5 mb-3">
                      {s.total > 0 &&
                        JOB_STATUSES.map((st) =>
                          s.counts[st] ? <div key={st} className={STATUS_STYLE[st].dot} style={{ width: `${(s.counts[st] / s.total) * 100}%` }} /> : null,
                        )}
                    </div>
                    <div className="space-y-0.5 text-[11px]">
                      {JOB_STATUSES.filter((st) => s.counts[st] > 0).map((st) => (
                        <div key={st} className="flex justify-between">
                          <StatusPill status={st} />
                          <span className="tabular-nums">{s.counts[st]}</span>
                        </div>
                      ))}
                      {s.total === 0 && <div className="text-slate-400">no jobs</div>}
                    </div>
                  </Link>
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">Click a stage to filter the job log. Translate only runs for non-English sources.</p>
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className={`${card} lg:col-span-2 overflow-hidden`}>
          <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
            <h2 className="text-lg font-bold">Errors</h2>
            <Link href="/admin/jobs" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">Replay dead letters →</Link>
          </div>
          {errors.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No failing or retrying jobs in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-white/5 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Stage</th>
                    <th className="px-5 py-3">Error</th>
                    <th className="px-5 py-3 text-right">Jobs</th>
                    <th className="px-5 py-3">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                  {errors.slice(0, 8).map((e) => (
                    <tr key={`${e.stage}${e.message}`}>
                      <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">{e.stage}</td>
                      <td className="px-5 py-3">
                        <div className="text-xs text-slate-500">{e.code}</div>
                        <div className="font-mono text-xs break-all text-rose-600 dark:text-rose-400">{e.message}</div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {e.count}
                        {e.deadLetters > 0 && <div className="text-[11px] text-rose-500">{e.deadLetters} dead</div>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{ago(e.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={`${card} p-5`}>
          <h2 className="text-lg font-bold mb-4">Content</h2>
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Source articles by state</h3>
          <ul className="space-y-1 text-sm mb-5">
            {content.sourceStates.map((s) => (
              <li key={s.state} className="flex justify-between"><span className="font-mono text-xs">{s.state}</span><span className="tabular-nums">{s.count}</span></li>
            ))}
            {content.sourceStates.length === 0 && <li className="text-slate-500">None yet</li>}
          </ul>
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Stories by status</h3>
          <ul className="space-y-1 text-sm">
            {content.articleStates.map((s) => (
              <li key={s.status} className="flex justify-between"><span className="font-mono text-xs">{s.status}</span><span className="tabular-nums">{s.count}</span></li>
            ))}
            {content.articleStates.length === 0 && <li className="text-slate-500">None yet</li>}
          </ul>
          <Link href="/admin/editorial" className="inline-block mt-4 text-sm text-teal-600 dark:text-teal-400 hover:underline">Editorial review →</Link>
        </section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
          <h2 className="text-lg font-bold">Sources</h2>
          <Link href="/admin/registry" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">Manage registry →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/5 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3">Last scan</th>
                <th className="px-5 py-3 text-right">Articles</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {sources.filter((s) => s.enabled || s.trustStatus === 'APPROVED').map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3">
                    <Link href={qs(current, { source: source === s.id ? undefined : s.id })} className="font-medium hover:text-teal-500">{s.name}</Link>
                    <div className="text-xs text-slate-500">{s.key} · {s.country} · {s.language}</div>
                  </td>
                  <td className="px-5 py-3 text-xs">{s.enabled ? <span className="text-emerald-600 dark:text-emerald-400">active</span> : <span className="text-slate-500">inactive</span>} · {s.trustStatus.toLowerCase()}</td>
                  <td className="px-5 py-3 text-xs">
                    <span className={s.failureStatus === 'OK' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{s.failureStatus}</span>
                    {s.consecutiveFailures > 0 && <span className="text-slate-500"> · {s.consecutiveFailures} failures</span>}
                    {s.lastError && <div className="text-rose-500 truncate max-w-xs" title={s.lastError}>{s.lastError}</div>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {ago(s.lastRun?.startedAt ?? s.lastSuccessfulScanAt)}
                    {s.lastRun && <div>{s.lastRun.status} · +{s.lastRun.newUrls} new</div>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.articles}</td>
                  <td className="px-5 py-3 text-right">{s.enabled && <ScanButton sourceId={s.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-200 dark:border-white/10">
          Showing approved sources. {sources.filter((s) => s.trustStatus !== 'APPROVED').length} more are pending approval in the registry. Click a source name to filter the job log.
        </p>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="p-5 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-lg font-bold">Latest articles through the pipeline</h2>
          <p className="text-xs text-slate-500 mt-1">One dot per stage. Click an article for its full trace.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/5 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Article</th>
                <th className="px-5 py-3 whitespace-nowrap">{STAGE_FLOW.slice(1).map((s) => s.label[0]).join(' ')}</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-5 py-3 max-w-md">
                    <Link href={`/admin/pipeline/item/${it.id}`} className="font-medium hover:text-teal-500 line-clamp-1">{it.headline ?? '(no headline)'}</Link>
                    <div className="text-xs text-slate-500">{it.publisher}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      {STAGE_FLOW.slice(1).map((s) => {
                        const st = it.stages[s.stage];
                        return <span key={s.stage} title={`${s.label}: ${st ? STATUS_STYLE[st]?.label ?? st : 'not reached'}`} className={`w-3 h-3 rounded-full ${st ? STATUS_STYLE[st]?.dot ?? 'bg-slate-400' : 'bg-slate-200 dark:bg-white/10'}`} />;
                      })}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{it.state}</td>
                  <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{ago(it.updatedAt)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No articles yet. Approve a source and run a scan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="p-5 border-b border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-lg font-bold">Job log</h2>
            <div className="text-xs text-slate-500">
              {stage && <>stage <b>{stage}</b> · </>}
              {sourceName && <>source <b>{sourceName}</b> · </>}
              newest {events.length}
              {(stage || status || source) && <Link href={qs(current, { stage: undefined, status: undefined, source: undefined })} className="ml-2 text-teal-600 dark:text-teal-400 hover:underline">clear filters</Link>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Link href={qs(current, { status: undefined })} className={`px-3 py-1 rounded-full text-xs font-medium ${!status ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-white/5'}`}>All</Link>
            {JOB_STATUSES.map((st) => (
              <Link key={st} href={qs(current, { status: st })} className={`px-3 py-1 rounded-full text-xs font-medium ${status === st ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-white/5'}`}>
                {STATUS_STYLE[st].label}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/5 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3 text-right">Took</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap font-mono">{new Date(e.updatedAt).toLocaleTimeString()}<div>{ago(e.updatedAt)}</div></td>
                  <td className="px-5 py-2.5 font-mono text-xs whitespace-nowrap">{e.stage}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <StatusPill status={e.status} />
                    {e.attempts > 1 && <div className="text-[11px] text-slate-500">attempt {e.attempts}/{e.maxAttempts}</div>}
                  </td>
                  <td className="px-5 py-2.5 max-w-xl">
                    {e.itemId ? <Link href={`/admin/pipeline/item/${e.itemId}`} className="hover:text-teal-500 line-clamp-1">{e.label}</Link> : <span className="line-clamp-1 break-all">{e.label}</span>}
                    {e.publisher && <div className="text-xs text-slate-500">{e.publisher}</div>}
                    {e.error?.message && e.status !== 'SUCCEEDED' && <div className="font-mono text-xs text-rose-600 dark:text-rose-400 break-all mt-1 line-clamp-2">{e.error.code}: {e.error.message}</div>}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">No jobs match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
          <h2 className="text-lg font-bold">Recent scans</h2>
          <Link href="/admin/logs" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">Raw service logs →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-white/5 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Started</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Result</th>
                <th className="px-5 py-3 text-right">Found</th>
                <th className="px-5 py-3 text-right">New</th>
                <th className="px-5 py-3 text-right">Updated</th>
                <th className="px-5 py-3 text-right">Errors</th>
                <th className="px-5 py-3 text-right">Took</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5 text-xs text-slate-500 whitespace-nowrap">{ago(r.startedAt)}</td>
                  <td className="px-5 py-2.5">{r.source.name}</td>
                  <td className={`px-5 py-2.5 text-xs font-medium ${r.status === 'failed' ? 'text-rose-600 dark:text-rose-400' : r.status === 'running' ? 'text-sky-600 dark:text-sky-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{r.status}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.totalUrls}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.newUrls}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.updatedUrls}</td>
                  <td className={`px-5 py-2.5 text-right tabular-nums ${r.errorCount ? 'text-rose-500' : ''}`}>{r.errorCount}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-slate-500 tabular-nums">{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-6 text-center text-slate-500">No scans yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
