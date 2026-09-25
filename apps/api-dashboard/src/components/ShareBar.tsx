'use client';

import React, { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';

/**
 * Share and copy-link for an article. Uses the native share sheet where the
 * browser has one (mobile), and plain links to X and LinkedIn otherwise.
 */
export function ShareBar({ url, title, id }: { url: string; title: string; id: string }) {
  const [copied, setCopied] = useState(false);
  // Known only in the browser; deciding it during render would mismatch hydration.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const base = { content_type: 'article', content_id: id };

  async function nativeShare() {
    try {
      await navigator.share({ url, title });
      track('share', { ...base, method: 'native' });
    } catch {
      // Dismissed the sheet: not a share.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      track('copy_link', base);
    } catch {
      setCopied(false);
    }
  }

  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  const button =
    'inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-500 hover:text-teal-700 dark:border-white/15 dark:text-slate-300 dark:hover:text-teal-400';

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this story" role="group">
      {canShare ? (
        <button type="button" onClick={nativeShare} className={button}>
          Share
        </button>
      ) : null}
      <a
        className={button}
        href={`https://x.com/intent/post?url=${encoded}&text=${text}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('share', { ...base, method: 'x' })}
      >
        Post on X<span className="sr-only"> (opens in a new tab)</span>
      </a>
      <a
        className={button}
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('share', { ...base, method: 'linkedin' })}
      >
        Share on LinkedIn<span className="sr-only"> (opens in a new tab)</span>
      </a>
      <button type="button" onClick={copy} className={button} aria-live="polite">
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}
