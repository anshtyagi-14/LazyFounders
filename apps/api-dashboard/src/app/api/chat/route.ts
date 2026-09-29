import { startChat } from '@/lib/founder-chat';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { recordSiteError } from '@/lib/site-errors';

export const dynamic = 'force-dynamic';

/** Body cap: the message allows 2,000 characters, plus name, email and attribution. */
const MAX_BODY_BYTES = 16 * 1024;

/** Starts a "Talk to founder" conversation. The reply carries the visitor's secret, shown only this once. */
export async function POST(req: Request) {
  // Per IP, and offices or mobile carriers put many readers behind one: loose enough for
  // them, tight enough that a script cannot flood the inbox. Follow-ups have their own limit.
  const limit = await rateLimit('chat_start', clientIp(req.headers), 10, 3600);
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
    const outcome = await startChat(body);
    if (outcome.kind === 'invalid') return Response.json({ ok: false, error: outcome.message }, { status: 400 });
    // A bot gets a success-shaped answer with nothing it can follow up on.
    if (outcome.kind === 'bot') return Response.json({ ok: true });
    return Response.json({ ok: true, id: outcome.id, token: outcome.token }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    await recordSiteError('founder_chat', '/api/chat', err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: 'Something went wrong. Please try again, or email us directly.' }, { status: 500 });
  }
}
