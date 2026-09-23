import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const PROTECTED = [/^\/api\/admin\//, /^\/sources(\/|$)/, /^\/api\/pipeline\//, /^\/internal\//, /^\/api\/stateless\//];

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Service-to-service authentication for admin/pipeline routes. The dashboard sends
 * `x-internal-token: $INTERNAL_API_TOKEN`. In production the token is mandatory;
 * in development an unset token only logs a warning so local setups keep working.
 */
const internalAuth: FastifyPluginAsync = async (fastify) => {
  const token = process.env.INTERNAL_API_TOKEN;
  const production = process.env.NODE_ENV === 'production';
  if (!token) fastify.log.warn(production ? 'INTERNAL_API_TOKEN unset: admin routes are disabled' : 'INTERNAL_API_TOKEN unset: admin routes are unauthenticated (development only)');

  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (!PROTECTED.some((re) => re.test(path))) return;
    if (!token) {
      if (production) return reply.code(503).send({ error: 'admin API disabled: INTERNAL_API_TOKEN not configured' });
      return;
    }
    const given = request.headers['x-internal-token'];
    if (typeof given !== 'string' || !safeEqual(given, token)) return reply.code(401).send({ error: 'unauthorized' });
  });
};

export const internalAuthPlugin = fp(internalAuth, { name: 'internal-auth' });
