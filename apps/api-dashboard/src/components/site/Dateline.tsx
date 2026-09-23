import React from 'react';

/**
 * The edition strip under the masthead: today's date, how many stories are live,
 * and when the newest one landed.
 *
 * Every value is read from the feed that renders below it. Nothing here is
 * decorative copy - if the wire is quiet, the strip says so.
 */
export function Dateline({ storyCount, newest }: { storyCount: number; newest: Date | null }) {
  const date = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const updated = newest
    ? newest.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false,
          timeZone: 'Asia/Kolkata' }) + ' IST'
    : null;

  return (
    <div className="border-b border-white/10 bg-[#0e0e11]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 font-display text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-gray-500 sm:px-6 lg:px-8">
        <span className="text-teal-500">{date}</span>
        <span aria-hidden="true" className="text-white/15">/</span>
        <span>
          {storyCount} {storyCount === 1 ? 'story' : 'stories'} live
        </span>
        {updated ? (
          <>
            <span aria-hidden="true" className="text-white/15">/</span>
            <span>Updated {updated}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
