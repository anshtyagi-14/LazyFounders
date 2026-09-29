import { getVisitorChat, postVisitorMessage, visitorUnread } from '@/lib/founder-chat';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { recordSiteError } from '@/lib/site-errors';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;
const NO_STORE = { 'cache-control': 'no-store' };

type Props = { params: Promise<{ id: string }> };

const token = (req: Request) => req.headers.get('x-chat-token') ?? '';
const notFound = () => Response.json({ ok: false, error: 'Conversation not found.' }, { status: 404, headers: NO_STORE });

/**
 * The visitor's side of a conversation: the thread, or with ?unread=1 just the count of
 * founder replies not yet seen (the widget's dot, checked without opening the thread).
 */
export async function GET(req: Request, { params }: Props) {
  const limit = await rateLimit('chat_read', clientIp(req.headers), 120, 600);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const { id } = await params;

  try {
    if (new URL(req.url).searchParams.has('unread')) {
      const unread = await visitorUnread(id, token(req));
      return unread === null ? notFound() : Response.json({ ok: true, unread }, { headers: NO_STORE });
    }
    const chat = await getVisitorChat(id, token(req));
    return chat ? Response.json({ ok: true, chat }, { headers: NO_STORE }) : notFound();
  } catch (err) {
    await recordSiteError('founder_chat', '/api/chat/[id]', err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

/** A follow-up message from the visitor. */
export async function POST(req: Request, { params }: Props) {
  const { id } = await params;
  const limit = await rateLimit('chat_message', `${clientIp(req.headers)}:${id}`, 20, 600);
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
    const outcome = await postVisitorMessage(id, token(req), body);
    switch (outcome.kind) {
      case 'posted':
        return Response.json({ ok: true, message: outcome.message }, { headers: NO_STORE });
      case 'invalid':
        return Response.json({ ok: false, error: outcome.message }, { status: 400 });
      case 'closed':
        return Response.json({ ok: false, error: 'This conversation is closed. Start a new one to write again.' }, { status: 409 });
      case 'not_found':
        return notFound();
    }
  } catch (err) {
    await recordSiteError('founder_chat', '/api/chat/[id]', err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
