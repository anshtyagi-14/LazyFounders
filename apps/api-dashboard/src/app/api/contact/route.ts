import { LEAD_SUCCESS_MESSAGE, storeLead } from '@/lib/leads';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { recordSiteError } from '@/lib/site-errors';

export const dynamic = 'force-dynamic';

/** Body cap: the message field allows 5,000 characters, plus the other fields. */
const MAX_BODY_BYTES = 16 * 1024;

/** Contact-form enquiries. Stored for the admin Leads page; nothing is emailed. */
export async function POST(req: Request) {
  const limit = await rateLimit('contact', clientIp(req.headers), 5, 600);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return Response.json({ ok: false, error: 'Your message is too long.' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: 'Invalid submission.' }, { status: 400 });
  }

  try {
    const outcome = await storeLead(body);
    if (outcome.kind === 'invalid') return Response.json({ ok: false, error: outcome.message }, { status: 400 });
    // stored and bot look identical from outside.
    return Response.json({ ok: true, message: LEAD_SUCCESS_MESSAGE });
  } catch (err) {
    await recordSiteError('contact_form', '/api/contact', err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: 'Something went wrong. Please try again, or email us directly.' }, { status: 500 });
  }
}
