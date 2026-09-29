import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from './prisma';

export const SITE_ERROR_TYPES = [
  'server_error',
  'page_error',
  'article_render',
  'api_error',
  'image_error',
  'email_capture',
  'contact_form',
  'founder_chat',
  'sitemap',
] as const;
export type SiteErrorType = (typeof SITE_ERROR_TYPES)[number];

export function isSiteErrorType(value: unknown): value is SiteErrorType {
  return typeof value === 'string' && (SITE_ERROR_TYPES as readonly string[]).includes(value);
}

/** Digits and hex ids vary between otherwise identical errors; strip them so repeats share a row. */
function normalise(message: string): string {
  return message.replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+/g, '#').slice(0, 200);
}

export function errorFingerprint(type: string, route: string, message: string): string {
  return createHash('sha256').update(`${type}|${route}|${normalise(message)}`).digest('hex').slice(0, 40);
}

/**
 * Store an error for the admin list. Repeats bump the count and reopen the row
 * if it had been marked resolved. Never throws: error reporting failing must
 * not turn into a second error for the caller.
 */
export async function recordSiteError(type: SiteErrorType, route: string, message: string): Promise<void> {
  const safeRoute = route.slice(0, 300) || '/';
  const safeMessage = message.slice(0, 500) || 'Unknown error';
  const fingerprint = errorFingerprint(type, safeRoute, safeMessage);
  try {
    await prisma.siteError.upsert({
      where: { fingerprint },
      create: { type, route: safeRoute, message: safeMessage, fingerprint },
      update: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, message: safeMessage },
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'failed to record site error', type, route: safeRoute, err: String(err) }));
  }
}
