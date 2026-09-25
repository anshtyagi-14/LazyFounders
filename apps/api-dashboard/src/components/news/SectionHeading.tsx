import React from 'react';
import Link from 'next/link';
import { gaAttrs } from '@/lib/ga-attrs';

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
        <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-500">{label}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--rule-gold)]" />
        {href ? (
          <Link
            href={href}
            {...gaAttrs('category_select', { category: label, source_surface: 'section_heading' })}
            className="inline-flex min-h-11 shrink-0 items-center font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-gray-600 hover:text-teal-700 transition-colors dark:text-gray-400 dark:hover:text-teal-400"
          >
            View all<span className="sr-only"> {label}</span>
          </Link>
        ) : null}
      </div>
      {blurb ? <p className="mt-2.5 text-sm text-gray-600 dark:text-gray-400">{blurb}</p> : null}
    </div>
  );
}
