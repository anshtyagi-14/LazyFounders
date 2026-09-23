'use client';

import React, { useCallback, useEffect, useState } from 'react';

type Job = {
  id: string;
  stage: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  replayCount: number;
  correlationId: string;
  subjectType: string;
  subjectId: string;
  idempotencyKey: string;
  lastError: { code?: string; message?: string; retryable?: boolean; at?: string } | null;
  updatedAt: string;
};

const STATUSES = ['DEAD_LETTER', 'RETRY_PENDING', 'RUNNING', 'QUEUED', 'SUCCEEDED'];

export default function JobsPage() {
  const [status, setStatus] = useState('DEAD_LETTER');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Array<{ stage: string; status: string; count: number }>>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs?status=${status}`).then((r) => r.json());
    setJobs(res.data?.jobs ?? []);
    setCounts(res.data?.counts ?? []);
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);

  const replay = async (id: string) => {
    const res = await fetch(`/api/jobs/${id}/replay`, { method: 'POST' }).then((r) => r.json());
    setMessage(res.success ? `Replayed job ${id}` : `Error: ${res.error}`);
    void load();
  };

  const stages = [...new Set(counts.map((c) => c.stage))].sort();
  const count = (stage: string, st: string) => counts.find((c) => c.stage === stage && c.status === st)?.count ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Pipeline Jobs</h1>
        <p className="text-slate-500">Durable job records per stage. Dead-lettered jobs never retry on their own; fix the cause, then replay (same idempotency key, no duplicates).</p>
        {message && <p className="mt-2 text-sm text-teal-500">{message}</p>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-white/5 text-left text-slate-500">
            <tr>
              <th className="p-3">Stage</th>
              {STATUSES.map((s) => <th key={s} className="p-3">{s.toLowerCase().replace('_', ' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {stages.map((st) => (
              <tr key={st} className="border-t border-slate-200 dark:border-white/10">
                <td className="p-3 font-mono text-xs">{st}</td>
                {STATUSES.map((s) => (
                  <td key={s} className={`p-3 ${s === 'DEAD_LETTER' && count(st, s) > 0 ? 'text-rose-400 font-bold' : ''}`}>{count(st, s)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${status === s ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-white/5'}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {jobs.length === 0 && <p className="text-sm text-slate-500">No jobs.</p>}
        {jobs.map((j) => (
          <div key={j.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs">{j.stage} · {j.subjectType}:{j.subjectId}</p>
                <p className="text-xs text-slate-500 break-all">key {j.idempotencyKey}</p>
                <p className="text-xs text-slate-500">correlation {j.correlationId} · attempts {j.attempts}/{j.maxAttempts} · replays {j.replayCount} · {new Date(j.updatedAt).toLocaleString()}</p>
                {j.lastError && (
                  <p className="text-xs mt-1 text-rose-400">
                    {j.lastError.code}: {j.lastError.message} {j.lastError.retryable === false && '(terminal)'}
                  </p>
                )}
              </div>
              {j.status === 'DEAD_LETTER' && (
                <button onClick={() => replay(j.id)} className="self-start px-3 py-1.5 rounded bg-teal-600 text-white text-xs">Replay</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
