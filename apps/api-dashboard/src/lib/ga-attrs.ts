/**
 * Declarative GA4 click tracking. A link carrying these attributes is reported
 * by the single delegated listener in <Analytics />, so server components can
 * tag links without shipping any per-link JavaScript.
 */

export type ArticleOrigin = 'synthesis' | 'wire' | 'press_release' | 'original' | 'partner';

export type GaParams = Record<string, string | number | undefined>;

export function gaAttrs(event: string, params: GaParams = {}): Record<string, string> {
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') clean[k] = v;
  return { 'data-ga-event': event, 'data-ga-params': JSON.stringify(clean) };
}

/** Coarse freshness bucket, so reports can compare breaking and evergreen clicks. */
export function publishAgeBucket(publishedAt: Date | string | undefined, now = Date.now()): string | undefined {
  if (!publishedAt) return undefined;
  const hours = (now - new Date(publishedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(hours)) return undefined;
  if (hours < 6) return 'lt_6h';
  if (hours < 24) return '6_24h';
  if (hours < 24 * 7) return '1_7d';
  return 'gt_7d';
}
