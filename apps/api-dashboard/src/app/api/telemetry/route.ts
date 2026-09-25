import { z } from 'zod';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { recordSiteError } from '@/lib/site-errors';

export const dynamic = 'force-dynamic';

/** Types a browser may report. Server-side types (server_error, sitemap, ...) are recorded directly. */
const Beacon = z.object({
  type: z.enum(['page_error', 'image_error', 'api_error', 'email_capture']),
  message: z.string().min(1).max(500),
  route: z.string().max(300).default('/'),
});

const MAX_BODY_BYTES = 2048;

/**
 * Client error beacons (error boundaries, broken images, failed fetches) for the
 * admin error list. Always answers 204 — a beacon has nobody to read a
 * response — and drops anything oversized, malformed or over the rate limit.
 */
export async function POST(req: Request) {
  const limit = await rateLimit('telemetry', clientIp(req.headers), 30, 60);
  if (!limit.ok) return new Response(null, { status: 204 });

  const text = await req.text().catch(() => '');
  if (!text || text.length > MAX_BODY_BYTES) return new Response(null, { status: 204 });

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = Beacon.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 204 });

  // Only paths, never full URLs or query strings, so no reader data lands in the log.
  const route = parsed.data.route.split('?')[0].split('#')[0] || '/';
  await recordSiteError(parsed.data.type, route, parsed.data.message);
  return new Response(null, { status: 204 });
}
