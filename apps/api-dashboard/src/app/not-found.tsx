import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';

// A 404 is never a page to index, but it is a page to navigate from.
export const metadata: Metadata = privateMetadata('Page not found');

export default function NotFound() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="max-w-xl">
        <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-teal-500">404</p>
        <h1 className="mt-3 font-headline text-3xl leading-tight text-gray-950 dark:text-white">
          That page is not here
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          The story may have been moved, or the link may be mistyped. The newsroom
          publishes continuously, so the front page is the fastest way back in.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-teal-500/40 px-4 py-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-teal-600 transition-colors hover:bg-teal-500 hover:text-black dark:text-teal-400"
          >
            Go to the front page
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 border border-black/15 px-4 py-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-gray-600 transition-colors hover:text-teal-700 dark:border-white/15 dark:text-gray-400 dark:hover:text-teal-400"
          >
            Search the archive
          </Link>
        </div>
      </div>
    </main>
  );
}
