'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Citation = { position: number; publisher: string; url: string; title: string | null; language: string | null };
type Version = {
  id: string;
  version: number;
  headline: string;
  seoTitle: string;
  metaDescription: string;
  intro: string;
  bodyMarkdown: string;
  generator: Record<string, unknown>;
  validationReport: { issues: Array<{ check: string; severity: string; message: string }>; confidence: number } | null;
  createdBy: string;
  createdAt: string;
  citations: Citation[];
};
type Claim = { id: string; text: string; kind: string; translated: boolean; verified: boolean; confidence: number | null; evidence: { original?: string; evidence?: string; language?: string } | null };
type StorySource = {
  id: string;
  role: string;
  decision: string;
  reasons: unknown;
  sourceArticle: {
    id: string;
    publisher: string;
    canonicalUrl: string | null;
    originalUrl: string;
    headline: string | null;
    language: string | null;
    publishedAt: string | null;
    bodyText: string | null;
    source: { name: string; country: string | null; trustStatus: string };
    translations: Array<{ status: string; headline: string | null; summary: string | null; model: string; promptVersion: string }>;
    extractions: Array<{ validationStatus: string; overallConfidence: number | null; model: string; promptVersion: string }>;
  };
};
type Article = {
  id: string;
  slug: string;
  status: string;
  currentVersionId: string | null;
  publishedVersionId: string | null;
  versions: Version[];
  actions: Array<{ id: string; actor: string; action: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string }>;
  story: { id: string; storyType: string; status: string; claims: Claim[]; sources: StorySource[] } | null;
};

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [article, setArticle] = useState<Article | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Version> | null>(null);
  const [showOriginal, setShowOriginal] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/editorial/${id}`).then((r) => r.json());
    setArticle(res.data ?? null);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!article) return <p className="text-slate-500">Loading…</p>;
  const current = article.versions.find((v) => v.id === article.currentVersionId) ?? article.versions[0];
  const live = article.versions.find((v) => v.id === article.publishedVersionId);

  const act = async (action: string) => {
    const res = await fetch(`/api/editorial/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: current?.id, note }),
    }).then((r) => r.json());
    setMessage(res.success ? `${action}: done${action === 'publish' ? ' (queued for the publishing service)' : ''}` : `Error: ${res.error}`);
    setNote('');
    void load();
  };

  const saveEdit = async () => {
    const res = await fetch(`/api/editorial/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) }).then((r) => r.json());
    setMessage(res.success ? 'Saved as a new version; re-validation queued.' : `Error: ${res.error}`);
    setEdit(null);
    void load();
  };

  const issues = current?.validationReport?.issues ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/editorial" className="text-sm text-teal-500">← Editorial queue</Link>
        <h1 className="text-2xl font-bold mt-2">{current?.headline ?? article.slug}</h1>
        <p className="text-sm text-slate-500">
          Status <b>{article.status}</b> · v{current?.version} by {current?.createdBy} · model {String(current?.generator?.model ?? '—')} ({String(current?.generator?.promptVersion ?? '—')})
          {live && <> · live: v{live.version} (<a className="underline" href={`/news/article/${article.slug}`} target="_blank" rel="noreferrer">view</a>)</>}
        </p>
        {message && <p className="mt-2 text-sm text-teal-500">{message}</p>}
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-3">
        <h2 className="font-bold">Decision</h2>
        <div className="flex flex-wrap gap-2">
          {issues.map((i, n) => (
            <span key={n} className={`text-xs px-2 py-1 rounded ${i.severity === 'error' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-500'}`}>
              {i.check}: {i.message}
            </span>
          ))}
          {issues.length === 0 && <span className="text-xs text-emerald-500">All validation checks passed (confidence {current?.validationReport?.confidence ?? '—'})</span>}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required to approve with open issues or to reject)" className="w-full rounded-lg border border-slate-300 dark:border-white/10 bg-transparent p-2 text-sm" rows={2} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => act('approve')} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Approve</button>
          <button onClick={() => act('publish')} disabled={article.status !== 'APPROVED'} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm disabled:opacity-40">Publish</button>
          <button onClick={() => act('reject')} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm">Reject</button>
          <button onClick={() => setEdit({ headline: current?.headline, seoTitle: current?.seoTitle, metaDescription: current?.metaDescription, intro: current?.intro, bodyMarkdown: current?.bodyMarkdown.split('\n## Sources\n')[0] })} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm">Edit</button>
          {article.publishedVersionId && <button onClick={() => act('archive')} className="px-4 py-2 rounded-lg bg-slate-500 text-white text-sm">Unpublish (archive)</button>}
        </div>
      </section>

      {edit && (
        <section className="rounded-2xl border border-teal-500/40 p-5 space-y-3">
          <h2 className="font-bold">Edit (creates a new version and re-runs validation)</h2>
          {(['headline', 'seoTitle', 'metaDescription', 'intro'] as const).map((k) => (
            <label key={k} className="block text-xs text-slate-500">
              {k}
              <input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="mt-1 w-full rounded border border-slate-300 dark:border-white/10 bg-transparent p-2 text-sm text-slate-900 dark:text-white" />
            </label>
          ))}
          <label className="block text-xs text-slate-500">
            body (markdown; the Sources section is regenerated automatically)
            <textarea value={edit.bodyMarkdown ?? ''} onChange={(e) => setEdit({ ...edit, bodyMarkdown: e.target.value })} rows={18} className="mt-1 w-full rounded border border-slate-300 dark:border-white/10 bg-transparent p-2 font-mono text-xs text-slate-900 dark:text-white" />
          </label>
          <div className="flex gap-2">
            <button onClick={saveEdit} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm">Save new version</button>
            <button onClick={() => setEdit(null)} className="px-4 py-2 rounded-lg bg-slate-600 text-white text-sm">Cancel</button>
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
          <h2 className="font-bold mb-3">Draft (v{current?.version})</h2>
          <p className="text-xs text-slate-500">SEO title: {current?.seoTitle}</p>
          <p className="text-xs text-slate-500 mb-3">Meta: {current?.metaDescription}</p>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{current?.intro}{'\n\n'}{current?.bodyMarkdown}</pre>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
            <h2 className="font-bold mb-3">Sources ({article.story?.sources.length ?? 0})</h2>
            {article.story?.sources.map((s) => {
              const sa = s.sourceArticle;
              const tr = sa.translations[0];
              const fx = sa.extractions[0];
              return (
                <div key={s.id} className="mb-4 border-b border-slate-200 dark:border-white/10 pb-3">
                  <p className="text-sm font-semibold">
                    {sa.source.name} ({sa.source.country}, {sa.language}) — {s.role.toLowerCase()} · {s.decision}
                  </p>
                  <a href={sa.canonicalUrl ?? sa.originalUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-500 break-all">{sa.headline ?? sa.canonicalUrl}</a>
                  <p className="text-xs text-slate-500">
                    extraction {fx?.validationStatus ?? '—'} ({fx?.model}, {fx?.promptVersion}, conf {fx?.overallConfidence ?? '—'})
                    {tr && <> · translation {tr.status} ({tr.model}, {tr.promptVersion})</>}
                  </p>
                  {tr?.headline && <p className="text-xs mt-1">Translated: {tr.headline}</p>}
                  <button className="text-xs underline text-slate-500" onClick={() => setShowOriginal(showOriginal === sa.id ? null : sa.id)}>
                    {showOriginal === sa.id ? 'hide' : 'show'} original text
                  </button>
                  {showOriginal === sa.id && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs bg-slate-100 dark:bg-white/5 p-3 rounded" lang={sa.language ?? undefined}>{sa.bodyText}</pre>}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
            <h2 className="font-bold mb-3">Facts & evidence</h2>
            <ul className="space-y-2">
              {article.story?.claims.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{c.text}</span>
                  <span className="ml-2 text-[10px] uppercase text-slate-500">
                    {c.kind}
                    {c.translated ? ' · machine-translated' : ''}
                    {c.kind === 'quote' ? (c.verified ? ' · verified verbatim' : ' · not verified: reported speech only') : ''}
                  </span>
                  {c.evidence?.evidence && <p className="text-xs text-slate-500">Evidence ({c.evidence.language}): “{c.evidence.evidence}”</p>}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
            <h2 className="font-bold mb-3">History</h2>
            <ul className="space-y-1 text-xs text-slate-500">
              {article.actions.map((a) => (
                <li key={a.id}>
                  {new Date(a.createdAt).toLocaleString()} — <b>{a.action}</b> by {a.actor} {a.fromStatus && `(${a.fromStatus} → ${a.toStatus})`} {a.note && `: ${a.note}`}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Versions: {article.versions.map((v) => `v${v.version}`).join(', ')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
