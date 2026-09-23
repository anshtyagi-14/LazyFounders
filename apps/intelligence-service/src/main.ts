import { loadConfig } from '@lazyfounders/config';
import { createLogger } from '@lazyfounders/logger';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import fastify from 'fastify';
import { STAGES, isLegacyPipelineEnabled, isPipelineV2Enabled, startPipelineRuntime, type PipelineRuntime } from '@lazyfounders/ingestion-core';
import { IntelligenceWorker } from './worker/intelligence-worker.js';
import { BedrockClient } from './llm/bedrock-client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    name: 'intelligence-service',
    level: config.app.logLevel,
    prettyPrint: config.app.nodeEnv === 'development',
  });

  const prisma = new PrismaClient();
  const workerRedis = new Redis(config.redis.port, config.redis.host, { maxRetriesPerRequest: null });

  // Start Background Worker
  // Legacy worker until cutover (LEGACY_PIPELINE_ENABLED=false disables it).
  const intelligenceWorker = isLegacyPipelineEnabled() ? new IntelligenceWorker(workerRedis as any, prisma, logger as any) : null;

  // v2 pipeline stages (feature flagged; WORKER_STAGES overrides the defaults).
  let runtime: PipelineRuntime | null = null;
  if (isPipelineV2Enabled()) {
    runtime = await startPipelineRuntime({ service: 'intelligence-service', defaultStages: [STAGES.DEDUPE, STAGES.GENERATE, STAGES.VALIDATE], prisma: prisma as any, logger: logger as any });
  }

  // Start HTTP API (for health checks)
  const server = fastify({ logger: false });
  // Service-to-service auth for the stateless API (the dashboard sends x-internal-token).
  server.addHook('onRequest', async (request, reply) => {
    const token = process.env.INTERNAL_API_TOKEN;
    if (!request.url.startsWith('/api/')) return;
    if (!token) {
      if (process.env.NODE_ENV === 'production') return reply.code(503).send({ error: 'INTERNAL_API_TOKEN not configured' });
      return;
    }
    if (request.headers['x-internal-token'] !== token) return reply.code(401).send({ error: 'unauthorized' });
  });

  server.get('/metrics', async (_req, reply) => {
    if (!runtime) return reply.code(404).send({ error: 'pipeline v2 disabled' });
    reply.header('Content-Type', runtime.metrics.registry.contentType);
    return runtime.metrics.registry.metrics();
  });

  
  server.get('/health', async () => {
    return { status: 'ok', service: 'intelligence-service' };
  });

  const bedrockClient = new BedrockClient(logger as any);

  server.post('/api/stateless/intelligence', async (request, reply) => {
    const { text, category } = request.body as any;
    
    if (!text || !category) {
      return reply.status(400).send({ error: 'text and category are required in body' });
    }

    try {
      const data = await bedrockClient.rewriteArticle(text, category);
      return reply.send({ success: true, data });
    } catch (err: any) {
      logger.error({ err }, 'Failed stateless intelligence rewrite');
      return reply.status(500).send({ error: 'Failed to rewrite text statelessly' });
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    try {
      await intelligenceWorker?.close();
      await runtime?.close();
      await server.close();
      await prisma.$disconnect();
      await workerRedis.quit();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await server.listen({
      port: 3004, // Explicitly 3004 for intelligence-service
      host: '0.0.0.0',
    });
    logger.info({ port: 3004, env: config.app.nodeEnv }, 'Intelligence service API & Worker started successfully');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();
