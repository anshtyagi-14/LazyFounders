import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PipelineRuntime } from '@lazyfounders/ingestion-core';

interface V2RouteOptions {
  prisma: PrismaClient;
  runtime: PipelineRuntime | null;
}

/** Internal v2 endpoints (behind the internal-auth plugin). */
export const v2Routes: FastifyPluginAsync<V2RouteOptions> = async (fastify, { prisma, runtime }) => {
  fastify.get('/metrics/pipeline', async (_req, reply) => {
    if (!runtime) return reply.code(404).send({ error: 'pipeline v2 disabled' });
    reply.header('Content-Type', runtime.metrics.registry.contentType);
    return runtime.metrics.registry.metrics();
  });

  fastify.post<{ Params: { id: string }; Body: { requestedBy?: string } }>('/internal/sources/:id/scan', async (req, reply) => {
    if (!runtime?.scheduler) return reply.code(409).send({ error: 'pipeline v2 scheduler not running in this process' });
    const source = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!source) return reply.code(404).send({ error: 'source not found' });
    if (source.trustStatus !== 'APPROVED' || !source.enabled) return reply.code(409).send({ error: 'source is not approved and active' });
    await runtime.scheduler.trigger(source.id, req.body?.requestedBy ?? 'admin');
    return reply.code(202).send({ queued: true });
  });

  fastify.get<{ Params: { id: string } }>('/internal/sources/:id/health', async (req, reply) => {
    const source = await prisma.source.findUnique({
      where: { id: req.params.id },
      include: { crawlRuns: { orderBy: { startedAt: 'desc' }, take: 10, select: { status: true, startedAt: true, newUrls: true, updatedUrls: true, errorCount: true, durationMs: true } } },
    });
    if (!source) return reply.code(404).send({ error: 'source not found' });
    return {
      id: source.id,
      key: source.registryKey,
      trustStatus: source.trustStatus,
      enabled: source.enabled,
      failureStatus: source.failureStatus,
      consecutiveFailures: source.consecutiveFailures,
      lastError: source.lastError,
      lastSuccessfulScanAt: source.lastSuccessfulScanAt,
      lastChangeDetectedAt: source.lastChangeDetectedAt,
      recentRuns: source.crawlRuns,
    };
  });
};
