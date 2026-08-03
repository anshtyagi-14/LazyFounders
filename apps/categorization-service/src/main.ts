
import { loadConfig } from '@lazyfounders/config';
import { createLogger } from '@lazyfounders/logger';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import fastify from 'fastify';
import { CategorizationWorker } from './worker/categorization-worker.js';
import { BedrockClient } from './llm/bedrock-client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    name: 'categorization-service',
    level: config.app.logLevel,
    prettyPrint: config.app.nodeEnv === 'development',
  });

  const prisma = new PrismaClient();
  const workerRedis = new Redis(config.redis.port, config.redis.host, { maxRetriesPerRequest: null });

  // Start Background Worker
  const categorizationWorker = new CategorizationWorker(workerRedis as any, prisma, logger as any);

  // Start HTTP API (for health checks)
  const server = fastify({ logger: false });
  
  server.get('/health', async () => {
    return { status: 'ok', service: 'categorization-service' };
  });

  const bedrockClient = new BedrockClient(logger as any);

  server.post('/api/stateless/categorize', async (request, reply) => {
    const { text } = request.body as any;
    
    if (!text) {
      return reply.status(400).send({ error: 'text is required in body' });
    }

    try {
      const data = await bedrockClient.categorizeByText(text);
      return reply.send({ success: true, data });
    } catch (err: any) {
      logger.error({ err, textLen: text.length }, 'Failed stateless categorize');
      return reply.status(500).send({ error: 'Failed to categorize text statelessly' });
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    try {
      await categorizationWorker.close();
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
      port: 3003, // Explicitly 3003 for categorization-service
      host: '0.0.0.0',
    });
    logger.info({ port: 3003, env: config.app.nodeEnv }, 'Categorization service API & Worker started successfully');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();
