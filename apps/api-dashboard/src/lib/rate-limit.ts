import 'server-only';
import type Redis from 'ioredis';
import { siteRedis } from './redis';

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window resets (for Retry-After). */
  retryAfter: number;
}

/**
 * Fixed-window counter: INCR a per-window key and expire it with the window.
 * Coarse, but enough to keep a script from filling the email table or the
 * error log. Fails open: if Redis is unreachable the request is allowed and
 * the outage is logged, because readers should not be blocked by bookkeeping.
 */
export async function rateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  redis: Redis = siteRedis(),
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${bucket}:${identity}:${window}`;
  const retryAfter = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return { ok: count <= limit, retryAfter };
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', msg: 'rate limiter unavailable, allowing request', bucket, err: String(err) }));
    return { ok: true, retryAfter };
  }
}

/** Client IP as the ALB reports it: the left-most X-Forwarded-For entry. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}

export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { ok: false, error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
