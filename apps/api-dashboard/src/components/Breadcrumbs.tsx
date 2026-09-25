import React from 'react';
import Link from 'next/link';
import type { Crumb } from '@/lib/seo';

/**
 * Visible trail matching the BreadcrumbList JSON-LD on the same page. The last
 * crumb is the current page and is not a link.
 */
export function Breadcrumbs({ crumbs, className = '' }: { crumbs: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.path} className="flex min-w-0 items-center gap-2">
              {last ? (
                <span aria-current="page" className="line-clamp-1 text-gray-700 dark:text-gray-300">
                  {c.name}
                </span>
              ) : (
                <Link href={c.path} className="hover:text-teal-700 hover:underline dark:hover:text-teal-400">
                  {c.name}
                </Link>
              )}
              {last ? null : <span aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
