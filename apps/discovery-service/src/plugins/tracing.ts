import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

/**
 * Fastify plugin for distributed tracing.
 * Extracts x-trace-id from headers or generates a new one.
 */
const tracingPluginAsync: FastifyPluginAsync = async (fastify, options) => {
  fastify.addHook('onRequest', async (request, reply) => {
    let traceId = request.headers['x-trace-id'] as string;
    
    if (!traceId) {
      traceId = randomUUID();
    }

    // Attach trace_id to request object
    (request as any).id = traceId;
  });
};

export const tracingPlugin = fp(tracingPluginAsync, {
  name: 'tracing-plugin',
});
