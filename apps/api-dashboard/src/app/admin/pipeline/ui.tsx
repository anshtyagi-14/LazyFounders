import React from 'react';

export const card = 'bg-white dark:bg-[#121820] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm';

export const STATUS_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  SUCCEEDED: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'done' },
  RUNNING: { dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', label: 'running' },
  QUEUED: { dot: 'bg-slate-400', text: 'text-slate-500', label: 'queued' },
  RETRY_PENDING: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'retrying' },
  DEAD_LETTER: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', label: 'dead letter' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { dot: 'bg-slate-400', text: 'text-slate-500', label: status.toLowerCase() };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function ago(d: Date | null | undefined): string {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
