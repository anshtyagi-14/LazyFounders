import 'server-only';
import { createSign } from 'node:crypto';

/**
 * Minimal GA4 Data API client for the admin analytics snapshot: a service
 * account JWT exchanged for an access token, then runReport over REST. Direct
 * REST keeps the gRPC-based @google-analytics/data package (and its native
 * dependencies) out of the standalone build.
 *
 * Configuration (both required, otherwise the snapshot reports "not configured"):
 *   GA4_PROPERTY_ID            numeric property id, e.g. 412345678
 *   GA4_SERVICE_ACCOUNT_JSON   the service account key file, base64-encoded.
 *                              The account needs Viewer on the property.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function config(): { propertyId: string; account: ServiceAccount } | null {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON?.trim();
  if (!propertyId || !raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const account = JSON.parse(json) as ServiceAccount;
    if (!account.client_email || !account.private_key) return null;
    return { propertyId, account };
  } catch {
    return null;
  }
}

export function ga4Configured(): boolean {
  return config() !== null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

let token: { value: string; expires: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(account.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GA4 token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

interface ReportRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

async function runReport(body: Record<string, unknown>): Promise<ReportRow[]> {
  const cfg = config();
  if (!cfg) throw new Error('GA4 not configured');
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(cfg.account)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GA4 runReport failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { rows?: ReportRow[] }).rows ?? [];
}

const num = (r: ReportRow | undefined, i = 0) => Number(r?.metricValues?.[i]?.value ?? 0);

export interface AnalyticsSnapshot {
  usersToday: number;
  pageViewsToday: number;
  topArticles: { path: string; title: string; views: number }[];
  topCategories: { category: string; reads: number }[];
  /** Last 7 days. */
  searches: number;
  completionRate: number | null;
  emailConversionRate: number | null;
}

const TTL_MS = 10 * 60 * 1000;
let cached: { value: AnalyticsSnapshot; expires: number } | null = null;

/** Throws when GA4 is unconfigured or unreachable; the admin page shows the reason. */
export async function analyticsSnapshot(): Promise<AnalyticsSnapshot> {
  if (cached && cached.expires > Date.now()) return cached.value;

  const today = [{ startDate: 'today', endDate: 'today' }];
  const week = [{ startDate: '7daysAgo', endDate: 'today' }];

  const [totals, articles, events, weekUsers, categories] = await Promise.all([
    runReport({ dateRanges: today, metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }] }),
    runReport({
      dateRanges: today,
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/news/article/' } } },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 5,
    }),
    runReport({
      dateRanges: week,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', inListFilter: { values: ['article_read_start', 'article_read_complete', 'search', 'sign_up'] } },
      },
    }),
    runReport({ dateRanges: week, metrics: [{ name: 'activeUsers' }] }),
    // Needs the event parameter `category` registered as a custom dimension in GA.
    runReport({
      dateRanges: week,
      dimensions: [{ name: 'customEvent:category' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'article_read_start' } } },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 6,
    }).catch(() => [] as ReportRow[]),
  ]);

  const byEvent = new Map(events.map((r) => [r.dimensionValues?.[0]?.value ?? '', num(r)]));
  const starts = byEvent.get('article_read_start') ?? 0;
  const users7d = num(weekUsers[0]);

  const value: AnalyticsSnapshot = {
    usersToday: num(totals[0], 0),
    pageViewsToday: num(totals[0], 1),
    topArticles: articles.map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? '',
      title: r.dimensionValues?.[1]?.value ?? '',
      views: num(r),
    })),
    topCategories: categories
      .map((r) => ({ category: r.dimensionValues?.[0]?.value ?? '', reads: num(r) }))
      .filter((c) => c.category && c.category !== '(not set)'),
    searches: byEvent.get('search') ?? 0,
    completionRate: starts > 0 ? (byEvent.get('article_read_complete') ?? 0) / starts : null,
    emailConversionRate: users7d > 0 ? (byEvent.get('sign_up') ?? 0) / users7d : null,
  };
  cached = { value, expires: Date.now() + TTL_MS };
  return value;
}
