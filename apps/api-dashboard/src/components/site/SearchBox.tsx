import React from 'react';

/**
 * A plain GET form. No client component and no JavaScript: the browser submits
 * to /search on Enter, so search keeps working with scripting disabled.
 */
export function SearchBox({
  defaultValue = '',
  className = '',
  id = 'site-search',
}: {
  defaultValue?: string;
  className?: string;
  /** Unique per instance: the masthead, the mobile menu and /search can all render one. */
  id?: string;
}) {
  return (
    <form action="/search" method="get" role="search" className={'relative ' + className}>
      <label htmlFor={id} className="sr-only">
        Search stories
      </label>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="20" y1="20" x2="16.7" y2="16.7" />
      </svg>
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search stories"
        maxLength={100}
        className="min-h-11 w-full border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-600 focus:border-teal-600 focus:bg-white transition-colors dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-400 dark:focus:bg-white/8"
      />
    </form>
  );
}
