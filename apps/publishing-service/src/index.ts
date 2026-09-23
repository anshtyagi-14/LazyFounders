import { createServer } from 'node:http';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@lazyfounders/logger';
import { loadConfig } from '@lazyfounders/config';
import { STAGES, isLegacyPipelineEnabled, isPipelineV2Enabled, startPipelineRuntime, type PipelineRuntime } from '@lazyfounders/ingestion-core';

const config = loadConfig();
const prisma = new PrismaClient();

const logger = createLogger({
  name: 'publishing-service',
  level: config.app.logLevel,
  prettyPrint: config.app.nodeEnv === 'development',
});

/**
 * Legacy publisher (pre-v2): marks OriginalContent as published. Kept until cutover;
 * disable with LEGACY_PIPELINE_ENABLED=false.
 */
function startLegacyWorker(): Worker {
  const redis = new Redis({ host: config.redis.host, port: config.redis.port, maxRetriesPerRequest: null });
  const worker = new Worker(
    'publishing-jobs',
    async (job: Job) => {
      const content = await prisma.originalContent.findUnique({ where: { id: job.data.originalContentId } });
      if (!content) throw new Error(`OriginalContent not found for ID: ${job.data.originalContentId}`);
      await prisma.originalContent.update({ where: { id: content.id }, data: { publishedToBlogAt: new Date() } });
      logger.info({ slug: content.slug }, 'Legacy article marked as published');
      return { success: true };
    },
    { connection: redis, prefix: 'lf' },
  );
  worker.on('error', (err) => logger.error({ err }, 'Legacy publishing worker error'));
  return worker;
}

async function main(): Promise<void> {
  const legacy = isLegacyPipelineEnabled() ? startLegacyWorker() : null;
  let runtime: PipelineRuntime | null = null;
  if (isPipelineV2Enabled()) {
    runtime = await startPipelineRuntime({ service: 'publishing-service', defaultStages: [STAGES.PUBLISH], prisma: prisma as any, logger });
  }

  // Health + metrics endpoint (no other HTTP surface).
  const port = Number(process.env.PORT_PUBLISHING || 3005);
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok', service: 'publishing-service', legacy: Boolean(legacy), v2: runtime?.stages ?? [] }));
      return;
    }
    if (req.url === '/metrics' && runtime) {
      res.writeHead(200, { 'content-type': runtime.metrics.registry.contentType }).end(await runtime.metrics.registry.metrics());
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, '0.0.0.0', () => logger.info({ port, legacy: Boolean(legacy), v2: Boolean(runtime) }, 'Publishing service started'));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close();
    await legacy?.close();
    await runtime?.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Publishing service failed to start');
  process.exit(1);
});
