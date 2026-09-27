import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { STAGE_FLOW, itemTrace } from '@/lib/pipeline-monitor';
import { AutoRefresh } from '../../controls';
import { StatusPill, ago, card } from '../../ui';

export const dynamic = 'force-dynamic';

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default async function ItemTrace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const trace = await itemTrace(id);
  if (!trace) notFound();
  const { item, story, article, jobs } = trace;
  const label = (stage: string) => STAGE_FLOW.find((s) => s.stage === stage)?.label ?? stage;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="min-w-0">
          <Link href="/admin/pipeline" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">← Pipeline Monitor</Link>
          <h1 className="text-2xl font-bold mt-2 break-words">{item.headline ?? '(no headline)'}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {item.source.name} · {item.language ?? '?'} · state <span className="font-mono">{item.state}</span>
            {item.stateReason && <> · {item.stateReason}</>}
          </p>
          <a href={item.canonicalUrl ?? item.finalUrl ?? item.originalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 dark:text-teal-400 hover:underline break-all">
            {item.canonicalUrl ?? item.finalUrl ?? item.originalUrl} ↗
          </a>
        </div>
        <AutoRefresh seconds={10} />
      </div>

      <section className={`${card} p-5`}>
        <h2 className="text-lg font-bold mb-4">Timeline</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500">No jobs recorded for this article.</p>
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-white/10 ml-2 space-y-5">
            {jobs.map((j) => (
              <li key={j.id} className="ml-5">
                <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-white dark:bg-[#121820] border-2 border-slate-300 dark:border-white/20" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{label(j.stage)}</span>
                  <span className="font-mono text-xs text-slate-500">{j.stage}</span>
                  <StatusPill status={j.status} />
                  <span className="text-xs text-slate-500">attempt {j.attempts}/{j.maxAttempts}{j.replayCount > 0 && ` · replayed ${j.replayCount}×`}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  queued {fmt(j.createdAt)} · started {fmt(j.startedAt)} · finished {fmt(j.completedAt)}
                  {j.startedAt && j.completedAt && <> · took {((j.completedAt.getTime() - j.startedAt.getTime()) / 1000).toFixed(1)}s</>}
                  {j.nextRunAt && j.status === 'RETRY_PENDING' && <> · next try {fmt(j.nextRunAt)}</>}
                </div>
                {j.error?.message && j.status !== 'SUCCEEDED' && (
                  <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 rounded-lg p-3">
                    {j.error.code}: {j.error.message}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-slate-500 mt-4">
          Scan <span className="font-mono">{jobs[0]?.correlationId ?? item.correlationId}</span>. Dead letters can be replayed from <Link href="/admin/jobs" className="underline">Jobs &amp; Dead Letters</Link>.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className={`${card} p-5 text-sm space-y-2`}>
          <h2 className="text-lg font-bold mb-2">Source article</h2>
          <p><span className="text-slate-500">Published:</span> {fmt(item.publishedAt)} ({ago(item.publishedAt)})</p>
          <p><span className="text-slate-500">Fetched:</span> {fmt(item.fetchedAt)}</p>
          <p><span className="text-slate-500">Extraction method:</span> {item.extractionMethod ?? '—'}</p>
          <p><span className="text-slate-500">Text length:</span> {item.bodyText?.length ?? 0} chars</p>
          <p><span className="text-slate-500">Paywalled:</span> {item.paywalled ? 'yes' : 'no'}</p>
          {item.subheadline && <p className="text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-white/10">{item.subheadline}</p>}
        </section>

        <section className={`${card} p-5 text-sm space-y-3`}>
          <h2 className="text-lg font-bold mb-2">Outputs</h2>
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-1">Fact extractions</h3>
            {item.extractions.length === 0 ? <p className="text-slate-500">None yet</p> : item.extractions.map((x) => (
              <p key={x.id} className="text-xs">
                <span className="font-mono">{x.validationStatus}</span> · {x.model} · confidence {x.overallConfidence?.toFixed(2) ?? '—'} · {ago(x.createdAt)}
              </p>
            ))}
          </div>
          {item.translations.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500 mb-1">Translations</h3>
              {item.translations.map((t) => <p key={t.id} className="text-xs">→ {t.targetLanguage} · {t.status} · {ago(t.createdAt)}</p>)}
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-1">Story</h3>
            {story ? <p className="text-xs">{story.headline} · <span className="font-mono">{story.status}</span></p> : <p className="text-slate-500">Not grouped into a story yet</p>}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-1">Lazyfounder article</h3>
            {article ? (
              <p className="text-xs">
                <span className="font-mono">{article.status}</span> ·{' '}
                <Link href={`/admin/editorial/${article.id}`} className="text-teal-600 dark:text-teal-400 hover:underline">editorial</Link>
                {article.publishedVersionId && <> · <a href={`/news/${article.slug}`} target="_blank" rel="noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline">live page ↗</a></>}
              </p>
            ) : (
              <p className="text-slate-500">Not generated yet</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
