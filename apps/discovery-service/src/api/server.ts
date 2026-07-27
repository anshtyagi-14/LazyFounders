import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import type { Container } from '../container.js';
import type { Logger } from 'pino';

export async function createServer(container: Container) {
  const { config, logger } = container;

  const server = Fastify({
    logger: false, // We use our own Pino logger
    requestTimeout: 30000,
    bodyLimit: 1048576, // 1MB
  });

  await server.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Request logging hook
  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    (request as any).log = logger.child({
      requestId: request.id,
      method: request.method,
      url: request.url,
    });
  });

  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed');
  });

  // Global error handler
  server.setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
    logger.error({
      err: error,
      requestId: request.id,
      method: request.method,
      url: request.url,
    }, 'Request error');

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message,
      statusCode,
    });
  });

  // Health check route
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '0.1.0',
  }));

  // Readiness check (verifies DB + Redis)
  server.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await container.prisma.$queryRaw`SELECT 1`;
      await container.redis.ping();
      return { status: 'ready' };
    } catch (err) {
      reply.status(503);
      return { status: 'not_ready', error: (err as Error).message };
    }
  });

  return server;
}
