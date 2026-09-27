'use client';

import React, { useState, useTransition } from 'react';
import type { StoryImageMode } from '@/lib/site-settings';
import { updateStoryImageMode } from './actions';

const OPTIONS: { value: StoryImageMode; title: string; body: string }[] = [
  {
    value: 'covers',
    title: 'Lazyfounder cover cards',
    body: 'Our own generated card per story. No publisher logos and no image-rights questions.',
  },
  {
    value: 'publisher',
    title: 'Publisher photos',
    body: "The source's lead image, credited to them. Some carry the publisher's logo, and they are not licensed to us.",
  },
];

export function StoryImageToggle({ mode }: { mode: StoryImageMode }) {
  const [current, setCurrent] = useState(mode);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: StoryImageMode) {
    if (next === current || pending) return;
    setError(null);
    start(async () => {
      try {
        await updateStoryImageMode(next);
        setCurrent(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save');
      }
    });
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Story images" className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const active = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(o.value)}
              className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
                active
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-[#0a0d14] dark:hover:border-white/20'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">{o.title}</span>
                {active ? <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-400">Live</span> : null}
              </span>
              <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{o.body}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400" role="status">
        {pending ? 'Saving and refreshing the site…' : error ? <span className="text-red-600 dark:text-red-400">{error}</span> : 'Takes effect on the next page load (up to 30 seconds).'}
      </p>
    </div>
  );
}
