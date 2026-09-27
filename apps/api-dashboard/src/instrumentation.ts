import type { Instrumentation } from 'next';

/**
 * Server-side errors (page renders, route handlers, server actions) go to the
 * site error log that the admin overview lists. The import is dynamic so the
 * Prisma client only loads in the Node.js runtime.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordSiteError } = await import('./lib/site-errors');

  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  const route = request.path.split('?')[0];
  const type = context.routeType === 'render' && context.routePath === '/news/[slug]'
    ? 'article_render'
    : context.routeType === 'route' && route.startsWith('/api/')
      ? 'api_error'
      : 'server_error';

  // Group by the route file (e.g. /news/[slug]), not each concrete URL.
  await recordSiteError(type, context.routePath || route, digest ? `${message} (digest ${digest})` : message);
};
