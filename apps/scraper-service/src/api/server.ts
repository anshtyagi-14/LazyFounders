import Fastify, { FastifyInstance } from 'fastify';
import { Logger } from 'pino';
import { Queue } from 'bullmq';

export async function createServer(logger: Logger, scraperQueue: Queue): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  server.post('/api/scrape', async (request, reply) => {
    const { url, domain, sourceId, changeType } = request.body as any;
    
    if (!url) {
      return reply.status(400).send({ error: 'url is required' });
    }

    try {
      const job = await scraperQueue.add('scrape', {
        url,
        domain: domain || new URL(url).hostname,
        urlHash: Buffer.from(url).toString('base64'),
        sourceId: sourceId || 'manual',
        discoveredAt: new Date().toISOString(),
        changeType: changeType || 'NEW',
        metadata: { priority: 1 } // Manual jobs get high priority
      });

      return reply.status(202).send({ 
        message: 'Scrape job queued successfully',
        jobId: job.id
      });
    } catch (err: any) {
      logger.error({ err, url }, 'Failed to enqueue manual scrape job');
      return reply.status(500).send({ error: 'Failed to enqueue job' });
    }
  });

  server.get('/api/scrape/status/:jobId', async (request, reply) => {
    const { jobId } = request.params as any;
    
    try {
      const job = await scraperQueue.getJob(jobId);
      
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      const state = await job.getState();
      const progress = job.progress;
      const failedReason = job.failedReason;
      
      return reply.send({ 
        jobId,
        state,
        progress,
        failedReason,
        data: job.data
      });
    } catch (err: any) {
      logger.error({ err, jobId }, 'Failed to check job status');
      return reply.status(500).send({ error: 'Failed to check job status' });
    }
  });

  return server;
}
