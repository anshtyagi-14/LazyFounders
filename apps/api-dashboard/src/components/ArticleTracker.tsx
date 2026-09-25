'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

const THRESHOLDS = [25, 50, 75, 90] as const;
/** Visible seconds before a read to the end counts as complete (skimming to the bottom does not). */
const COMPLETE_MIN_SECONDS = 20;
/** Visible seconds that make a view an engaged read. */
const ENGAGED_SECONDS = 30;

/**
 * Article engagement for GA4: read start, scroll depth through the story body
 * (not the whole page, whose footer would inflate it), completion and an
 * engaged-read marker. Also reports table-of-contents clicks, whose links are
 * rendered from markdown and cannot carry data attributes.
 *
 * `bodySelector` is the story text; its bottom edge is the end of the read.
 */
export function ArticleTracker({
  id,
  category,
  origin,
  bodySelector = '[data-article-body]',
}: {
  id: string;
  category: string;
  origin: string;
  bodySelector?: string;
}) {
  useEffect(() => {
    const base = { content_type: 'article', content_id: id, category, article_origin: origin };
    track('article_read_start', base);

    const fired = new Set<number>();
    let reachedEnd = false;
    let completed = false;
    let engaged = false;
    let visibleMs = 0;
    let lastTick = Date.now();
    let frame = 0;

    const body = document.querySelector<HTMLElement>(bodySelector);

    function maybeComplete() {
      if (completed || !reachedEnd || visibleMs < COMPLETE_MIN_SECONDS * 1000) return;
      completed = true;
      track('article_read_complete', { ...base, engagement_seconds: Math.round(visibleMs / 1000) });
    }

    function measure() {
      frame = 0;
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const read = window.innerHeight - rect.top;
      const pct = rect.height > 0 ? Math.min(100, Math.max(0, (read / rect.height) * 100)) : 0;
      for (const t of THRESHOLDS) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          track('article_read_progress', { ...base, percent_scrolled: t });
        }
      }
      if (pct >= 100) {
        reachedEnd = true;
        maybeComplete();
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    // Count only time the tab is actually visible.
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') visibleMs += now - lastTick;
      lastTick = now;
      if (!engaged && visibleMs >= ENGAGED_SECONDS * 1000) {
        engaged = true;
        track('article_engaged', { ...base, engagement_seconds: ENGAGED_SECONDS });
      }
      maybeComplete();
    }, 1000);

    function onClick(e: MouseEvent) {
      const link = (e.target as Element | null)?.closest?.('.table-of-contents a');
      if (!link) return;
      track('toc_select', { ...base, content_id: id, item_name: (link.textContent || '').trim().slice(0, 100) });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, { capture: true });
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, { capture: true });
      window.clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [id, category, origin, bodySelector]);

  return null;
}
