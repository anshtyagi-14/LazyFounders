'use client';

import React, { useCallback, useEffect, useState } from 'react';

type Source = {
  id: string;
  registryKey: string;
  name: string;
  domain: string;
  country: string | null;
  defaultLanguage: string | null;
  trustStatus: string;
  enabled: boolean;
  feedUrls: string[];
  customSitemapUrls: string[];
  crawlIntervalMinutes: number;
  rateLimitPerMinute: number;
  renderPolicy: string;
  publishingPolicy: { mode?: string; minConfidence?: number } | null;
  failureStatus: string;
  consecutiveFailures: number;
  lastError: string | null;
  lastSuccessfulScanAt: string | null;
  lastChangeDetectedAt: string | null;
};

const TRUST: Record<string, string> = { APPROVED: 'text-emerald-500', PENDING: 'text-amber-500', SUSPENDED: 'text-rose-400' };
const HEALTH: Record<string, string> = { OK: 'text-emerald-500', DEGRADED: 'text-amber-500', FAILING: 'text-rose-400', BLOCKED: 'text-rose-400' };

export default function RegistryPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/registry/sources').then((r) => r.json());
    setSources(res.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/registry/sources/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    setMessage(res.success ? 'Updated.' : `Error: ${res.error}`);
    void load();
  };
  const scan = async (id: string) => {
    const res = await fetch(`/api/registry/sources/${id}/scan`, { method: 'POST' }).then((r) => r.json());
    setMessage(res.success ? 'Scan queued.' : `Error: ${res.error}`);
  };

  const shown = sources.filter((s) => !filter || `${s.name} ${s.country} ${s.defaultLanguage} ${s.domain}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Trusted Source Registry</h1>
        <p className="text-slate-500 text-sm">
          Sources are defined in <code>sources/&lt;country&gt;/&lt;key&gt;.yaml</code> and synced with <code>npm run sources:sync</code>. Verify a new source with{' '}
          <code>npm run sources:verify -- &lt;key&gt;</code> and review its robots.txt and terms before approving it. Only APPROVED sources can be active.
        </p>
        {message && <p className="mt-2 text-sm text-teal-500">{message}</p>}
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, country, language…" className="w-full max-w-sm rounded-lg border border-slate-300 dark:border-white/10 bg-transparent p-2 text-sm" />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-white/5 text-left text-slate-500">
            <tr>
              <th className="p-3">Source</th>
              <th className="p-3">Trust</th>
              <th className="p-3">Health</th>
              <th className="p-3">Last scan / change</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="border-t border-slate-200 dark:border-white/10 align-top">
                <td className="p-3">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {s.registryKey} · {s.country} · {s.defaultLanguage} · {s.domain} · every {s.crawlIntervalMinutes}m · {s.rateLimitPerMinute}/min · render {s.renderPolicy} · publish {s.publishingPolicy?.mode ?? 'MANUAL'}
                  </p>
                  <p className="text-xs text-slate-500 break-all">{[...s.feedUrls, ...s.customSitemapUrls].join(', ')}</p>
                </td>
                <td className={`p-3 font-semibold ${TRUST[s.trustStatus] ?? ''}`}>
                  {s.trustStatus}
                  <p className="text-xs font-normal text-slate-500">{s.enabled ? 'active' : 'inactive'}</p>
                </td>
                <td className={`p-3 ${HEALTH[s.failureStatus] ?? ''}`}>
                  {s.failureStatus}
                  {s.consecutiveFailures > 0 && <p className="text-xs text-slate-500">{s.consecutiveFailures} failures: {s.lastError}</p>}
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {s.lastSuccessfulScanAt ? new Date(s.lastSuccessfulScanAt).toLocaleString() : 'never'}
                  <br />
                  {s.lastChangeDetectedAt ? new Date(s.lastChangeDetectedAt).toLocaleString() : '—'}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {s.trustStatus !== 'APPROVED' && <button onClick={() => patch(s.id, { trustStatus: 'APPROVED' })} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs">Approve</button>}
                    {s.trustStatus === 'APPROVED' && !s.enabled && <button onClick={() => patch(s.id, { enabled: true })} className="px-2 py-1 rounded bg-teal-600 text-white text-xs">Activate</button>}
                    {s.enabled && <button onClick={() => patch(s.id, { enabled: false })} className="px-2 py-1 rounded bg-slate-600 text-white text-xs">Pause</button>}
                    {s.trustStatus !== 'SUSPENDED' && <button onClick={() => patch(s.id, { trustStatus: 'SUSPENDED' })} className="px-2 py-1 rounded bg-rose-600 text-white text-xs">Suspend</button>}
                    {s.enabled && <button onClick={() => scan(s.id)} className="px-2 py-1 rounded bg-slate-800 text-white text-xs">Scan now</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
