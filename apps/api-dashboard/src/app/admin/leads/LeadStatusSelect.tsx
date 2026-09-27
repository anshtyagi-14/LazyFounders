'use client';

import React, { useTransition } from 'react';
import { LEAD_STATUSES } from '@/lib/lead-options';
import { setLeadStatus } from './actions';

export function LeadStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Lead status"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => setLeadStatus(id, next));
      }}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium capitalize text-slate-700 disabled:opacity-50 dark:border-white/10 dark:bg-[#0d1117] dark:text-slate-300"
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
