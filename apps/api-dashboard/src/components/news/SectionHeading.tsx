import React from 'react';
import Link from 'next/link';

/**
 * Every block on the homepage opens the same way: a gold eyebrow, a rule that
 * runs to the edge of the column, and an optional link out to the full archive.
 * The rule is the structural device - there are no cards around sections, so the
 * rules are what separate one beat from the next.
 */
export function SectionHeading({
  label,
  blurb,
  href,
  id,
}: {
  label: string;
  blurb?: string;
  href?: string;
  id?: string;
}) {
  return (
    <div id={id} className="mb-7 scroll-mt-[calc(var(--header-h)+2rem)]">
      <div className="flex items-baseline gap-4">
        <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-teal-500">{label}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--rule-gold)]" />
        {href ? (
          <Link
            href={href}
            className="shrink-0 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-gray-500 hover:text-teal-400 transition-colors"
          >
            View all
          </Link>
        ) : null}
      </div>
      {blurb ? <p className="mt-2.5 text-sm text-gray-500">{blurb}</p> : null}
    </div>
  );
}
