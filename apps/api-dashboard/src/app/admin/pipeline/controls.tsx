'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Re-renders the server page on an interval so counts and the event log stay live. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [last, setLast] = useState(() => new Date());

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      router.refresh();
      setLast(new Date());
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);

  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${on ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
        {on ? `Live · every ${seconds}s` : 'Paused'} · updated {last.toLocaleTimeString()}
      </span>
      <button onClick={() => setOn((v) => !v)} className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-white/10 font-medium">
        {on ? 'Pause' : 'Resume'}
      </button>
      <button
        onClick={() => {
          router.refresh();
          setLast(new Date());
        }}
        className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-white/10 font-medium"
      >
        Refresh
      </button>
    </div>
  );
}

/** Queues an immediate scan through the normal discovery path (admin only). */
export function ScanButton({ sourceId }: { sourceId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  return (
    <button
      disabled={state === 'busy'}
      title={msg}
      onClick={async () => {
        setState('busy');
        try {
          const res = await fetch(`/api/registry/sources/${sourceId}/scan`, { method: 'POST' }).then((r) => r.json());
          setState(res.success ? 'ok' : 'err');
          setMsg(res.success ? 'Scan queued' : res.error ?? 'Failed');
        } catch (e) {
          setState('err');
          setMsg((e as Error).message);
        }
      }}
      className={`px-2 py-1 rounded text-xs font-medium text-white ${state === 'err' ? 'bg-rose-600' : state === 'ok' ? 'bg-emerald-600' : 'bg-slate-800'}`}
    >
      {state === 'busy' ? 'Queuing…' : state === 'ok' ? 'Queued ✓' : state === 'err' ? 'Failed' : 'Scan now'}
    </button>
  );
}
