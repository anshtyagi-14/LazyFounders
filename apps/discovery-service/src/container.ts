import { PrismaClient, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { loadConfig, type AppConfig } from '@lazyfounders/config';
import { createLogger } from '@lazyfounders/logger';
import type { Logger } from 'pino';

export interface Container {
  config: AppConfig;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
  dispose(): Promise<void>;
}

export async function createContainer(): Promise<Container> {
  const config = loadConfig();

  const logger = createLogger({
    name: 'discovery-service',
    level: config.app.logLevel,
    prettyPrint: config.app.nodeEnv === 'development',
  });

  const prisma = new PrismaClient({
    log: config.app.nodeEnv === 'development'
      ? [{ level: 'query', emit: 'event' }]
      : [{ level: 'error', emit: 'stdout' }],
  });

  // Log slow queries in development
  if (config.app.nodeEnv === 'development') {
    prisma.$on('query' as never, (e: Prisma.QueryEvent) => {
      if (e.duration > 100) {
        logger.warn({ duration: e.duration, query: e.query }, 'Slow query detected');
      }
    });
  }

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      logger.warn({ attempt: times, delayMs: delay }, 'Redis connection retry');
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error({ err }, 'Redis error'));

  // Verify connections
  await prisma.$connect();
  logger.info('PostgreSQL connected');

  await redis.ping();
  logger.info('Redis ping successful');

  const dispose = async (): Promise<void> => {
    logger.info('Disposing container resources...');
    await redis.quit();
    await prisma.$disconnect();
    logger.info('All resources disposed');
  };

  return { config, logger, prisma, redis, dispose };
}
