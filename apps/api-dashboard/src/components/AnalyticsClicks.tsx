'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/**
 * One document-level click listener for every link tagged with gaAttrs()
 * (data-ga-event + data-ga-params). Capture phase, so it runs before
 * navigation starts; gtag queues the hit with transport_type beacon.
 */
export function AnalyticsClicks() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.('[data-ga-event]');
      if (!el) return;
      const event = el.getAttribute('data-ga-event');
      if (!event) return;
      let params: Record<string, string | number> = {};
      try {
        params = JSON.parse(el.getAttribute('data-ga-params') || '{}');
      } catch {
        // Malformed params: still count the click.
      }
      track(event, { ...params, transport_type: 'beacon' });
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);
  return null;
}
