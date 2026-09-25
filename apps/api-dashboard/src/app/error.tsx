'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { reportPageError } from '@/lib/analytics';

// Error boundaries must be client components, so this page cannot export
// metadata; the root layout's defaults apply and the status code is 500.
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportPageError(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="max-w-xl">
        <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-teal-600 dark:text-teal-500">Error</p>
        <h1 className="mt-3 font-headline text-3xl leading-tight text-gray-950 dark:text-white">
          This page failed to load
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Something went wrong on our side. It has been logged. Try again, or head back to the front page.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex min-h-11 items-center gap-2 border border-teal-500/40 px-4 py-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-teal-700 transition-colors hover:bg-teal-500 hover:text-black dark:text-teal-400"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 border border-black/15 px-4 py-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-gray-600 transition-colors hover:text-teal-700 dark:border-white/15 dark:text-gray-400 dark:hover:text-teal-400"
          >
            Go to the front page
          </Link>
        </div>
      </div>
    </main>
  );
}
