import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import promClient from 'prom-client';

/**
 * Fastify plugin for exposing Prometheus metrics.
 */
const metricsPluginAsync: FastifyPluginAsync = async (fastify, options) => {
  // Initialize default metrics
  promClient.collectDefaultMetrics({ register: promClient.register });

  // Expose /metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', promClient.register.contentType);
    return promClient.register.metrics();
  });
};

export const metricsPlugin = fp(metricsPluginAsync, {
  name: 'metrics-plugin',
});
