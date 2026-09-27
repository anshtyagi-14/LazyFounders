'use client';

import { useEffect } from 'react';
import { reportPageError } from '@/lib/analytics';

// Replaces the root layout when it fails, so it ships its own <html>/<body> and
// inline styles: globals.css and the fonts are not guaranteed to be there.
export default function GlobalError({
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
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
        <title>Something went wrong | Lazyfounder</title>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 16px' }}>
          <p style={{ color: '#d4af37', fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Error</p>
          <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '12px 0 0' }}>The site failed to load</h1>
          <p style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.6, marginTop: 16 }}>
            Something went wrong on our side and it has been logged. Please try again in a moment.
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ minHeight: 44, padding: '8px 16px', border: '1px solid #d4af37', background: 'transparent', color: '#d4af37', fontWeight: 700, cursor: 'pointer' }}
            >
              Try again
            </button>
            {/* A full reload on purpose: the client router is what just failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ minHeight: 44, padding: '8px 16px', border: '1px solid #3f3f46', color: '#d4d4d8', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Go to the front page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
