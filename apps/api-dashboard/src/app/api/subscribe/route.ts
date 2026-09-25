import { SIGNUP_SUCCESS_MESSAGE, storeSignup } from '@/lib/email-signup';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { recordSiteError } from '@/lib/site-errors';

export const dynamic = 'force-dynamic';

/**
 * Early-access email capture. Stores the address and where it came from;
 * nothing is sent and no account is created.
 */
export async function POST(req: Request) {
  const limit = await rateLimit('subscribe', clientIp(req.headers), 5, 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid submission.' }, { status: 400 });
  }

  try {
    const outcome = await storeSignup(body);
    if (outcome.kind === 'invalid') return Response.json({ ok: false, error: outcome.message }, { status: 400 });
    // stored, duplicate and bot all look identical from outside.
    return Response.json({ ok: true, message: SIGNUP_SUCCESS_MESSAGE });
  } catch (err) {
    await recordSiteError('email_capture', '/api/subscribe', err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
