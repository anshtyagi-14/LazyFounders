'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Row = {
  id: string;
  slug: string;
  status: string;
  category: string | null;
  headline: string;
  version: number | null;
  sources: number;
  storyType: string | null;
  primaryEntity: string | null;
  errors: string[];
  isLive: boolean;
  updatedAt: string;
};

type SourceReview = {
  id: string;
  publisher: string;
  headline: string | null;
  language: string | null;
  canonicalUrl: string | null;
  stateReason: string | null;
  storySource: { storyId: string; reasons: { possibleDuplicateOf?: string | null } | null } | null;
  translations: Array<{ status: string; headline: string | null; summary: string | null; validation: unknown }>;
  extractions: Array<{ validationStatus: string; errors: unknown }>;
};

const TABS = ['', 'DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'];
const BADGE: Record<string, string> = {
  DRAFT: 'bg-sky-500/10 text-sky-500',
  NEEDS_REVIEW: 'bg-amber-500/10 text-amber-500',
  APPROVED: 'bg-emerald-500/10 text-emerald-500',
  PUBLISHED: 'bg-teal-500/10 text-teal-400',
  REJECTED: 'bg-rose-500/10 text-rose-400',
};

export default function EditorialQueue() {
  const [tab, setTab] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<SourceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, r] = await Promise.all([
      fetch(`/api/editorial${tab ? `?status=${tab}` : ''}`).then((x) => x.json()),
      fetch('/api/editorial/source-reviews').then((x) => x.json()),
    ]);
    setRows(a.data ?? []);
    setReviews(r.data ?? []);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
    setMessage(res.success ? 'Done.' : `Error: ${res.error}`);
    void load();
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-2">Editorial Review</h1>
        <p className="text-slate-500 dark:text-slate-400">Generated stories wait here for approval. Nothing is published without passing the publishing gates.</p>
        {message && <p className="mt-3 text-sm text-teal-500">{message}</p>}
      </div>

      <section>
        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t || 'queue'}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === t ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-slate-300'}`}
            >
              {t ? t.replace('_', ' ').toLowerCase() : 'review queue'}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-white/5 text-left text-slate-500">
              <tr>
                <th className="p-3">Story</th>
                <th className="p-3">Status</th>
                <th className="p-3">Sources</th>
                <th className="p-3">Validation</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-6 text-slate-500" colSpan={5}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="p-6 text-slate-500" colSpan={5}>Nothing here.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-200 dark:border-white/10 align-top">
                    <td className="p-3">
                      <Link href={`/admin/editorial/${r.id}`} className="font-semibold hover:text-teal-500">{r.headline}</Link>
                      <div className="text-xs text-slate-500 mt-1">
                        {r.primaryEntity ?? '—'} · {r.storyType ?? 'story'} · {r.category ?? 'uncategorised'} · v{r.version ?? '?'} {r.isLive && <span className="text-teal-500">· live version exists</span>}
                      </div>
                    </td>
                    <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-semibold ${BADGE[r.status] ?? 'bg-slate-500/10 text-slate-400'}`}>{r.status}</span></td>
                    <td className="p-3">{r.sources}</td>
                    <td className="p-3 text-xs">{r.errors.length ? <span className="text-amber-500">{r.errors.slice(0, 2).join('; ')}</span> : <span className="text-emerald-500">passed</span>}</td>
                    <td className="p-3 text-xs text-slate-500">{new Date(r.updatedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">Source articles needing review</h2>
        <p className="text-sm text-slate-500 mb-4">Stopped before story generation: invalid or ungrounded extraction, translation issues, or a possible duplicate story.</p>
        <div className="space-y-3">
          {reviews.length === 0 && <p className="text-sm text-slate-500">None.</p>}
          {reviews.map((s) => {
            const dupStory = s.stateReason?.startsWith('possible_duplicate_of_story:') ? s.storySource?.storyId : null;
            const target = s.stateReason?.split(':')[1];
            const tr = s.translations[0];
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.headline ?? s.canonicalUrl}</p>
                    <p className="text-xs text-slate-500">
                      {s.publisher} · {s.language ?? 'und'} · <span className="text-amber-500">{s.stateReason}</span>{' '}
                      {s.canonicalUrl && <a className="underline" href={s.canonicalUrl} target="_blank" rel="noreferrer">original</a>}
                    </p>
                    {tr && tr.status !== 'VALID' && (
                      <p className="text-xs mt-2 text-slate-400">Translation: {tr.headline} — {tr.summary}<br />Issues: {JSON.stringify(tr.validation)}</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-start">
                    {dupStory ? (
                      <>
                        <button className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs" onClick={() => act(`/api/editorial/stories/${dupStory}`, { action: 'keep' })}>Separate story</button>
                        {target && <button className="px-3 py-1.5 rounded bg-teal-600 text-white text-xs" onClick={() => act(`/api/editorial/stories/${dupStory}`, { action: 'merge', targetStoryId: target })}>Merge into existing</button>}
                      </>
                    ) : (
                      <>
                        {tr && tr.status !== 'VALID' && (
                          <button className="px-3 py-1.5 rounded bg-teal-600 text-white text-xs" onClick={() => act(`/api/editorial/source-reviews/${s.id}`, { action: 'accept_translation' })}>Translation verified</button>
                        )}
                        <button className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs" onClick={() => act(`/api/editorial/source-reviews/${s.id}`, { action: 'retry' })}>Retry</button>
                      </>
                    )}
                    <button className="px-3 py-1.5 rounded bg-rose-600 text-white text-xs" onClick={() => act(`/api/editorial/source-reviews/${s.id}`, { action: 'reject' })}>Reject</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
