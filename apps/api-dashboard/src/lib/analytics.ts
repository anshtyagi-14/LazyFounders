/**
 * Browser-side analytics helpers. Safe to import from client components only:
 * every function is a no-op on the server and when gtag has not loaded (local
 * dev, ad blockers, NEXT_PUBLIC_GA_ID=""), so callers never have to guard.
 */

type Gtag = (command: 'event', name: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

export function track(event: string, params: AnalyticsParams = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = v;
  window.gtag('event', event, clean);
}

export type TelemetryType = 'page_error' | 'image_error' | 'api_error' | 'email_capture';

/**
 * Error beacon to /api/telemetry, which stores it for the admin error list.
 * sendBeacon survives the page unloading; fetch keepalive is the fallback.
 */
export function reportError(type: TelemetryType, message: string, route?: string): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    type,
    message: message.slice(0, 500),
    route: (route ?? window.location.pathname).slice(0, 300),
  });
  try {
    if (navigator.sendBeacon?.('/api/telemetry', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/telemetry', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
  } catch {
    // Telemetry must never break the page.
  }
}

/** GA4 "page_error" event plus the stored beacon, for error boundaries. */
export function reportPageError(error: Error & { digest?: string }): void {
  const message = error.digest ? `digest:${error.digest}` : error.message || 'Unknown error';
  track('page_error', { error_type: error.name || 'Error' });
  reportError('page_error', message);
}
