'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ADSENSE_CLIENT, adsEnabled } from '@/lib/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdFormat = 'auto' | 'horizontal' | 'rectangle';

/** Space held open while the unit loads, so the page does not jump when it fills. */
const MIN_HEIGHT: Record<AdFormat, number> = { auto: 250, horizontal: 90, rectangle: 250 };

/**
 * One AdSense display unit. Renders nothing until its slot ID is set in
 * AD_SLOTS, and nothing outside production. An unfilled unit is hidden by
 * globals.css, label and all.
 */
export function AdSlot({ slot, format = 'auto', className = '' }: { slot: string; format?: AdFormat; className?: string }) {
  if (!adsEnabled || !slot) return null;
  return (
    <div className={`ad-slot not-prose ${className}`}>
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
        Advertisement
      </p>
      <AdUnit slot={slot} format={format} />
    </div>
  );
}

function AdUnit({ slot, format }: { slot: string; format: AdFormat }) {
  // Keyed on the route so a client-side navigation gets a fresh <ins>: AdSense
  // fills each element once and ignores a push for one it already filled.
  const pathname = usePathname();
  return <AdIns key={pathname} slot={slot} format={format} />;
}

function AdIns({ slot, format }: { slot: string; format: AdFormat }) {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked by an ad blocker, or the loader failed: leave the slot empty.
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block', minHeight: MIN_HEIGHT[format] }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
