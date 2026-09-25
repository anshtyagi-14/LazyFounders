'use client';

import React, { useTransition } from 'react';
import { setSiteErrorResolved } from '../overview-actions';

export function ResolveErrorButton({ id, resolved }: { id: string; resolved: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setSiteErrorResolved(id, !resolved))}
      className="text-xs font-medium text-slate-600 hover:text-teal-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-teal-400"
    >
      {pending ? '…' : resolved ? 'Reopen' : 'Resolve'}
    </button>
  );
}
