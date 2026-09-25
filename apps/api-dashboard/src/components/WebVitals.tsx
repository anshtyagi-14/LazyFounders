'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { track } from '@/lib/analytics';

// A stable reference: a new function each render would re-report every metric.
const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  // Google's recommended GA4 shape: one event per metric, named after it, with
  // CLS scaled so it survives GA's integer rounding.
  track(metric.name, {
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    non_interaction: true,
  });
};

/** Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to GA4 for field performance data. */
export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
