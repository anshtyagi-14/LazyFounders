import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PipelineOrchestrator } from '../orchestrator/pipeline-orchestrator';

export interface SourceRoutesOptions {
  pipelineOrchestrator: PipelineOrchestrator;
  prisma: any; // Using any for prisma as the type is not fully known here, assume PrismaClient
}

export const sourceRoutes: FastifyPluginAsync<SourceRoutesOptions> = async (
  fastify: FastifyInstance,
  options: SourceRoutesOptions
) => {
  const { pipelineOrchestrator, prisma } = options;

  fastify.post('/sources', async (request, reply) => {
    const { domain, baseUrl, name, cronExpression, isActive, discoveryIntervalMinutes } = request.body as any;

    try {
      const source = await prisma.source.create({
        data: {
          domain,
          baseUrl,
          name,
          enabled: isActive !== undefined ? isActive : true,
          crawlFrequency: (request.body as any).cronExpression || "0 */1 * * *",
        },
      });
      return reply.status(201).send(source);
    } catch (error: any) {
      request.log.error(error, 'Error creating source');
      return reply.status(500).send({ error: 'Failed to create source' });
    }
  });

  fastify.get('/sources', async (request, reply) => {
    try {
      const sources = await prisma.source.findMany();
      return reply.status(200).send(sources);
    } catch (error: any) {
      request.log.error(error, 'Error fetching sources');
      return reply.status(500).send({ error: 'Failed to fetch sources' });
    }
  });

  fastify.post('/sources/:id/discover', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      // Execute the discovery asynchronously
      // In a real production system, this could be pushed to a queue or tracked differently
      pipelineOrchestrator.runDiscovery(id).catch((err) => {
        request.log.error(err, `Error running manual discovery for source ${id}`);
      });
      
      return reply.status(202).send({ message: 'Discovery started' });
    } catch (error: any) {
      request.log.error(error, 'Error starting discovery');
      return reply.status(500).send({ error: 'Failed to start discovery' });
    }
  });
};
