import { createContainer } from './container.js';
import { createServer } from './api/server.js';
import { UserAgentRotator } from './fetcher/user-agent-rotator.js';
import { FetchClient } from './fetcher/fetch-client.js';
import { SimpleHttpStrategy } from './fetcher/fetch-strategies/simple-http.strategy.js';
import { BrowserHeadersStrategy } from './fetcher/fetch-strategies/browser-headers.strategy.js';
import { PlaywrightStrategy } from './fetcher/fetch-strategies/playwright.strategy.js';
import { PlaywrightStealthStrategy } from './fetcher/fetch-strategies/playwright-stealth.strategy.js';
import { CloudflareBypassStrategy } from './fetcher/fetch-strategies/cloudflare-bypass.strategy.js';
import { ProxyStrategy } from './fetcher/fetch-strategies/proxy.strategy.js';
import { ResidentialProxyStrategy } from './fetcher/fetch-strategies/residential-proxy.strategy.js';
import { FetchEscalator } from './fetcher/fetch-escalator.js';
import { RedisRateLimiter } from './fetcher/rate-limiter.js';
import { RobotsTxtCache } from './fetcher/robots-txt-cache.js';
import { RobotsTxtDiscoveryStrategy } from './discovery/strategies/robots-txt.strategy.js';
import { KnownEndpointsStrategy } from './discovery/strategies/known-endpoints.strategy.js';
import { CmsDetectionStrategy } from './discovery/strategies/cms-detection.strategy.js';
import { RssFeedStrategy } from './discovery/strategies/rss-feed.strategy.js';
import { HeuristicStrategy } from './discovery/strategies/heuristic.strategy.js';
import { DiscoveryEngine } from './discovery/discovery-engine.js';
import { SaxSitemapParser } from './parser/sax-parser.js';
import { RegexFallbackParser } from './parser/regex-fallback.js';
import { UrlNormalizer } from './filter/url-normalizer.js';
import { ArticleFilter } from './filter/article-filter.js';
import { RecencyFilter } from './filter/recency-filter.js';
import { CustomRulesEngine } from './filter/custom-rules.js';
import { FilterPipeline } from './filter/filter-pipeline.js';
import { RedisBloomFilter } from './diff/bloom-filter.js';
import { RedisStateStore } from './diff/state-store.js';
import { DiffEngine } from './diff/diff-engine.js';
import { createQueueAdapter } from './queue/queue-factory.js';
import { CategorizationQueue } from './queue/categorization-queue.js';
import { PipelineOrchestrator } from './orchestrator/pipeline-orchestrator.js';
import { CronScheduler } from './scheduler/cron-scheduler.js';
import { sourceRoutes } from './api/source-routes.js';
import { metricsPlugin } from './plugins/metrics.js';
import { tracingPlugin } from './plugins/tracing.js';
import type { IFetchStrategy } from './fetcher/types.js';

async function main(): Promise<void> {
  const container = await createContainer();
  const { config, logger, redis, prisma } = container;

  // 1. Fetcher Subsystem
  const userAgentRotator = new UserAgentRotator();
  const fetchClientConfig = {
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxRedirects: 5,
    keepAlive: true,
    maxSockets: 50
  };
  const fetchClient = new FetchClient(fetchClientConfig, logger);
  const rateLimiter = new RedisRateLimiter(redis, 60, logger);
  const robotsTxtCache = new RobotsTxtCache(fetchClient, redis, logger, 86400);

  const fetchStrategies: IFetchStrategy[] = [
    new SimpleHttpStrategy(fetchClient, logger),
    new BrowserHeadersStrategy(fetchClient, userAgentRotator, logger),
    new CloudflareBypassStrategy({ headless: true }, logger),
    new PlaywrightStrategy({ headless: true }, logger),
    new PlaywrightStealthStrategy({ headless: true }, logger),
  ];
  
  // NOTE: Config is abstracted, so we bypass strict proxy checks here for simplicity,
  // or we can add them conditionally if properties exist.
  if ((config as any).proxy) {
    fetchStrategies.push(new ProxyStrategy(fetchClient, (config as any).proxy, logger));
    if ((config as any).residentialProxy) {
      fetchStrategies.push(new ResidentialProxyStrategy(fetchClient, (config as any).proxy, (config as any).residentialProxy, logger));
    }
  }

  const fetchEscalator = new FetchEscalator(fetchStrategies, rateLimiter, robotsTxtCache, logger);

  // 2. Discovery Subsystem
  const discoveryStrategies = [
    new RobotsTxtDiscoveryStrategy(robotsTxtCache, logger),
    new KnownEndpointsStrategy(fetchEscalator, logger),
    new CmsDetectionStrategy(fetchEscalator, logger),
    new RssFeedStrategy(fetchEscalator, logger),
    new HeuristicStrategy(fetchEscalator, logger)
  ];
  const discoveryEngine = new DiscoveryEngine(discoveryStrategies, logger);

  // 3. Parser & Filter Subsystem
  const saxParser = new SaxSitemapParser(logger);
  const regexParser = new RegexFallbackParser(logger);

  const urlNormalizer = new UrlNormalizer();
  const articleFilter = new ArticleFilter();
  const recencyFilter = new RecencyFilter();
  const customRulesEngine = new CustomRulesEngine();
  const filterPipeline = new FilterPipeline(urlNormalizer, articleFilter, recencyFilter, customRulesEngine, logger);

  // 4. Diff Engine
  const bloomFilter = new RedisBloomFilter(redis, logger);
  const stateStore = new RedisStateStore(redis, logger);
  const diffEngine = new DiffEngine(bloomFilter, stateStore, logger);

  // 5. Queue & Orchestrator
  const queueAdapter = createQueueAdapter(config, redis, logger);
  const categorizationQueue = new CategorizationQueue(queueAdapter, logger);

  const categorizationQueueAdapter = {
    enqueue: async (job: { url: string; domain: string; changeType: any; sourceId: string }) => {
      await categorizationQueue.emitCategorizationJob({
        url: job.url,
        domain: job.domain,
        urlHash: Buffer.from(job.url).toString('base64'),
        sourceId: job.sourceId,
        discoveredAt: new Date().toISOString(),
        changeType: job.changeType,
        metadata: { priority: 5 }
      } as any);
    }
  };

  const pipelineOrchestrator = new PipelineOrchestrator(
    discoveryEngine,
    saxParser,
    regexParser,
    filterPipeline,
    diffEngine,
    fetchEscalator,
    categorizationQueueAdapter,
    logger,
    prisma
  );

  // 6. Scheduler & Worker
  const cronScheduler = new CronScheduler(prisma, pipelineOrchestrator, logger, 60000);

  // 7. Server Setup
  const server = await createServer(container, discoveryEngine);
  
  await server.register(metricsPlugin);
  await server.register(tracingPlugin);
  await server.register(sourceRoutes, { pipelineOrchestrator, prisma });

  // Start scheduler
  cronScheduler.start();

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    try {
      cronScheduler.stop(); // Assuming a stop method exists

      await server.close();
      logger.info('HTTP server closed');

      await container.dispose();
      logger.info('Shutdown complete');

      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  try {
    await server.listen({
      port: config.app.port,
      host: '0.0.0.0',
    });
    logger.info({ port: config.app.port, env: config.app.nodeEnv }, 'Discovery service started');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();
