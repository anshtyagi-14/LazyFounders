import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public access to the home page (exact match)
  if (pathname === '/') {
    return NextResponse.next();
  }

  // 2. Allow public access to static assets, images, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.includes('/favicon.ico') ||
    pathname.startsWith('/api/') || // Assuming APIs should remain accessible for the backend
    pathname.startsWith('/uploads/') // Public media
  ) {
    return NextResponse.next();
  }

  // 3. Enforce Basic Authentication on everything else (e.g. /dashboard, /admin, /company)
  const basicAuth = req.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    // Retrieve valid credentials from environment variables (fallback for local dev)
    const validUser = process.env.ADMIN_USER || 'admin';
    const validPass = process.env.ADMIN_PASSWORD || 'lazyfounders';

    if (user === validUser && pwd === validPass) {
      return NextResponse.next();
    }
  }

  // Return a 401 to prompt the browser's native login modal
  return new NextResponse('Authentication Required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Private Dashboard"',
    },
  });
}

// Ensure the middleware runs on all routes so we can selectively whitelist inside it
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
