import { createServer } from './api/server.js';
import { ScraperWorker } from './scraper/worker.js';
import { loadConfig } from '@lazyfounders/config';
import pino from 'pino';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({
    level: config.app.logLevel,
    transport: { target: 'pino-pretty' }
  });

  // Database & Redis
  const prisma = new PrismaClient();
  const redis = new Redis(config.redis.port, config.redis.host);
  
  const workerRedis = new Redis(config.redis.port, config.redis.host, { maxRetriesPerRequest: null });

  // BullMQ Queue for Enqueueing (Async API)
  const scraperQueue = new Queue('scraper-jobs', {
    prefix: 'lf',
    connection: {
      host: config.redis.host,
      port: config.redis.port
    }
  });

  // Start Background Worker
  const scraperWorker = new ScraperWorker(workerRedis as any, prisma, logger);

  // Start HTTP API
  const server = await createServer(logger, scraperQueue);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    try {
      await scraperWorker.close();
      await server.close();
      await scraperQueue.close();
      await prisma.$disconnect();
      await redis.quit();
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
      port: 3002, // Explicitly 3002 for scraper-service
      host: '0.0.0.0',
    });
    logger.info({ port: 3002, env: config.app.nodeEnv }, 'Scraper service API & Worker started successfully');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();
