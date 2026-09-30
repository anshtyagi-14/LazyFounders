import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authConfigured, verifyBasicAuth } from './lib/editor-auth';

/**
 * Editorial areas behind Basic Auth. Everything else is the public site, so an
 * unknown URL reaches the router and gets a real 404 instead of a login prompt.
 */
const PROTECTED_PREFIXES = ['/admin', '/dashboard', '/developers', '/tools', '/api/'];
/** Reader-facing API routes (rate-limited in the handler) and routes that check their own credentials. */
const PUBLIC_API = ['/api/subscribe', '/api/contact','/api/telemetry', '/api/health', '/api/v1/', '/api/revalidate'];
/** Admin-only areas: registry changes, API keys, job replay. */
const ADMIN_ONLY = [/^\/admin\/sources/, /^\/admin\/registry/, /^\/admin\/settings/, /^\/api\/registry\//, /^\/api\/admin\//, /^\/api\/keys/, /^\/developers/, /^\/api\/jobs\/[^/]+\/replay/];

function isProtected(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) return false;
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) return true;
  // A server action can be invoked by POSTing its id to any page, public ones
  // included. Only the editorial pages use actions, so require a login for them.
  return req.headers.has('next-action');
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never trust identity headers coming from the client.
  const headers = new Headers(req.headers);
  headers.delete('x-editor-user');
  headers.delete('x-editor-role');

  if (!isProtected(req)) return NextResponse.next({ request: { headers } });

  if (!authConfigured()) {
    return new NextResponse('Editorial access is not configured (set EDITOR_USERS or ADMIN_USER/ADMIN_PASSWORD).', { status: 503 });
  }

  const editor = verifyBasicAuth(req.headers.get('authorization'));
  if (!editor) {
    // Only challenge a real page navigation. A background request (a <Link> prefetch
    // scrolled into view, a fetch) that gets WWW-Authenticate makes the browser pop a
    // login dialog on a public page. Next strips its own prefetch headers before the
    // proxy runs, so use the browser's Sec-Fetch-Mode; clients without it (curl) are challenged.
    const mode = req.headers.get('sec-fetch-mode');
    const challenge = !mode || mode === 'navigate';
    return new NextResponse('Authentication Required', {
      status: 401,
      headers: challenge ? { 'WWW-Authenticate': 'Basic realm="Lazyfounder Editorial"' } : {},
    });
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
