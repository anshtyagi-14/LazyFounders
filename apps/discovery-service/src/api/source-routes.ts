import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PipelineOrchestrator } from '../orchestrator/pipeline-orchestrator';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

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
      request.log.error(error, 'Error fetching pipeline stats');
      return reply.status(500).send({ error: 'Failed to fetch pipeline stats' });
    }
  });

  // Admin Dashboard Routes
  fastify.get('/api/admin/sources', async (request, reply) => {
    try {
      const sources = await prisma.source.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return reply.status(200).send({ sources });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch sources' });
    }
  });

  fastify.patch('/api/admin/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { crawlFrequency } = request.body as { crawlFrequency: string };
    try {
      const source = await prisma.source.update({
        where: { id },
        data: { crawlFrequency }
      });
      return reply.status(200).send({ source });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update source' });
    }
  });

  fastify.get('/api/admin/logs', async (request, reply) => {
    try {
      const runs = await prisma.crawlRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: {
          source: {
            select: { name: true, domain: true }
          }
        }
      });
      return reply.status(200).send({ runs });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });

  fastify.get('/api/admin/live-logs', async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    // We spawn tail via shell to expand the glob pattern and use -q to suppress headers
    const tailProcess = spawn('sh', ['-c', 'tail -q -n 100 -f ../*/logs/*.log'], { cwd: process.cwd() });

    const { domain } = request.query as { domain?: string };

    tailProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Filter by domain if provided
        if (domain && !line.includes(domain)) continue;

        try {
          // Verify it's JSON (or just send the raw text if it's not)
          JSON.parse(line);
          reply.raw.write(`data: ${line}\n\n`);
        } catch {
          // If it's not JSON, package it as a simple log
          reply.raw.write(`data: ${JSON.stringify({ msg: line, level: 30, time: Date.now() })}\n\n`);
        }
      }
    });

    request.raw.on('close', () => {
      tailProcess.kill();
    });
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

  fastify.post('/api/pipeline/discover-site', async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ success: false, error: 'URL is required' });

    try {
      let hostname = '';
      try { hostname = new URL(url).hostname; } catch(e) { hostname = url; }
      
      // Find or create source
      let source = await prisma.source.findFirst({ where: { domain: hostname } });
      if (!source) {
        source = await prisma.source.create({
          data: {
            domain: hostname,
            baseUrl: url,
            name: hostname,
            enabled: true,
            crawlFrequency: '0 */1 * * *'
          }
        });
      }

      // Run discovery asynchronously (but we'll await it here since it's relatively fast for a single site's sitemaps)
      const crawlStats = await pipelineOrchestrator.runDiscovery(source.id);

      return reply.status(200).send({ 
        success: true, 
        message: 'Full site discovery completed', 
        stats: crawlStats 
      });
    } catch (error: any) {
      request.log.error(error, 'Error discovering site');
      return reply.status(500).send({ success: false, error: 'Failed to discover site' });
    }
  });
  fastify.post('/api/pipeline/trigger', async (request, reply) => {
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ success: false, error: 'URL is required' });

    try {
      const urlHash = Buffer.from(url).toString('base64');
      
      let source = await prisma.source.findFirst({ where: { name: 'Manual Triggers' } });
      if (!source) {
        source = await prisma.source.create({
          data: {
            name: 'Manual Triggers',
            domain: 'manual.local',
            baseUrl: 'http://manual.local'
          }
        });
      }

      // Check if already processed
      const existingUrlState = await prisma.urlState.findUnique({
        where: { urlHash },
        include: { categorizationResult: { include: { intelligenceResult: true } } }
      });

      if (existingUrlState?.categorizationResult?.intelligenceResult) {
        // Update last seen
        await prisma.urlState.update({
          where: { urlHash },
          data: { lastSeenAt: new Date() }
        });

        // Fetch the final article + pipeline-wide stats
        const [original, totalScraped, duplicates, newArticles] = await Promise.all([
          prisma.originalContent.findUnique({
            where: { intelligenceResultId: existingUrlState.categorizationResult.intelligenceResult.id }
          }),
          prisma.scrapeResult.count(),
          prisma.intelligenceResult.count({ where: { isDuplicate: true } }),
          prisma.originalContent.count()
        ]);

        return reply.status(200).send({
          success: true, urlHash, cached: true,
          pipelineStats: { totalScraped, duplicates, newArticles },
          data: {
            seoTitle: original?.seoTitle || 'Generated Title',
            slug: original?.slug || 'article-slug'
          }
        });
      }

      // If the URL exists but doesn't have a final intelligence result, it got stuck.
      // We must delete the old partial state so BullMQ doesn't deduplicate the job ID and Prisma doesn't throw unique constraint errors.
      if (existingUrlState) {
        await prisma.urlState.delete({ where: { id: existingUrlState.id } });
      }

      // Start fresh
      await prisma.urlState.create({
        data: {
          url,
          urlHash,
          sourceId: source.id,
          changeType: 'NEW',
          status: 'active'
        }
      });

      await (pipelineOrchestrator as any).scraperQueue.enqueue({
        url,
        domain: new URL(url).hostname,
        changeType: 'NEW',
        sourceId: source.id
      });

      return reply.status(200).send({ success: true, urlHash, cached: false });
    } catch (error: any) {
      request.log.error(error, 'Error triggering pipeline');
      return reply.status(500).send({ success: false, error: 'Failed to trigger pipeline' });
    }
  });

  fastify.get('/api/pipeline/status/:hash', async (request, reply) => {
    const { hash } = request.params as { hash: string };
    
    try {
      const urlState = await prisma.urlState.findUnique({ where: { urlHash: hash } });
      if (!urlState) {
        return reply.status(404).send({ success: false, error: 'Not Found' });
      }

      const category = await prisma.categorizationResult.findUnique({ where: { urlStateId: urlState.id } });
      let scrape = null;
      let intelligence = null;
      
      if (category) {
        scrape = await prisma.scrapeResult.findUnique({ where: { categorizationId: category.id } });
        intelligence = await prisma.intelligenceResult.findUnique({ where: { categorizationId: category.id } });
      }
      
      if (intelligence) {
        // Also get OriginalContent + pipeline-wide stats
        const [original, totalScraped, duplicates, newArticles] = await Promise.all([
          prisma.originalContent.findUnique({ where: { intelligenceResultId: intelligence.id } }),
          prisma.scrapeResult.count(),
          prisma.intelligenceResult.count({ where: { isDuplicate: true } }),
          prisma.originalContent.count()
        ]);
        return reply.status(200).send({
          status: 'DONE',
          message: 'Intelligence analysis complete and article ready.',
          data: {
            seoTitle: original?.seoTitle || 'Generated Title',
            slug: original?.slug || 'article-slug'
          },
          pipelineStats: { totalScraped, duplicates, newArticles }
        });
      }

      if (category) {
        return reply.status(200).send({
          status: 'ANALYZING',
          message: 'Categorization complete. Running intelligence analysis...'
        });
      }

      // If we don't have a category, wait... scrapeResult is linked to categorizationId.
      // So if category doesn't exist, scrape doesn't exist.
      // But wait! Scraper creates categorization result FIRST?
      // Actually, scraper queue receives URL, does scraping, creates CategorizationResult and ScrapeResult?
      // Let's assume SCRAPING if no category exists.
      
      return reply.status(200).send({
        status: 'SCRAPING',
        message: 'URL is in the queue for scraping...'
      });

    } catch (error: any) {
      request.log.error(error, 'Error checking status');
      return reply.status(500).send({ success: false, error: 'Failed to check status' });
    }
  });
};
