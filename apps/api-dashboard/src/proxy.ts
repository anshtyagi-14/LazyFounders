import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authConfigured, verifyBasicAuth } from './lib/editor-auth';

/** Readers, crawlers and API-key clients: no Basic Auth. */
const PUBLIC_PREFIXES = ['/news/', '/company/', '/coming-soon', '/_next', '/uploads/', '/css/', '/logos/', '/images/'];
const PUBLIC_EXACT = new Set([
  '/',
  '/news', // redirects to /
  '/search', // reader-facing site search
  '/sitemap.xml',
  '/news-sitemap.xml',
  '/robots.txt',
  '/llms.txt',
  '/feed.xml',
  '/manifest.webmanifest',
  '/og', // generated social cards, fetched unauthenticated by every crawler and chat client
  '/favicon.ico',
  '/favicon.svg',
  '/placeholder.jpg',
]);
/** Authenticated in the route handler itself (API key / shared secret). */
const SELF_AUTHENTICATED = ['/api/v1/', '/api/revalidate'];
const STATIC_EXT = /\.(css|js|png|jpe?g|svg|webp|gif|ico|woff2?|txt|xml|webmanifest)$/i;
/** Admin-only areas: registry changes, API keys, job replay. */
const ADMIN_ONLY = [/^\/admin\/sources/, /^\/admin\/registry/, /^\/api\/registry\//, /^\/api\/admin\//, /^\/api\/keys/, /^\/developers/, /^\/api\/jobs\/[^/]+\/replay/];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never trust identity headers coming from the client.
  const headers = new Headers(req.headers);
  headers.delete('x-editor-user');
  headers.delete('x-editor-role');

  const isPublic =
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    SELF_AUTHENTICATED.some((p) => pathname.startsWith(p)) ||
    (!pathname.startsWith('/api/') && STATIC_EXT.test(pathname));
  if (isPublic) return NextResponse.next({ request: { headers } });

  if (!authConfigured()) {
    return new NextResponse('Editorial access is not configured (set EDITOR_USERS or ADMIN_USER/ADMIN_PASSWORD).', { status: 503 });
  }

  const editor = verifyBasicAuth(req.headers.get('authorization'));
  if (!editor) {
    return new NextResponse('Authentication Required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="LazyFounders Editorial"' } });
  }
  if (editor.role !== 'admin' && ADMIN_ONLY.some((re) => re.test(pathname))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  headers.set('x-editor-user', editor.user);
  headers.set('x-editor-role', editor.role);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
