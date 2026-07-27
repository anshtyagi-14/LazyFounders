import { createContainer } from './container.js';
import { FetchClient } from './fetcher/fetch-client.js';
import { UserAgentRotator } from './fetcher/user-agent-rotator.js';
import { SimpleHttpStrategy } from './fetcher/fetch-strategies/simple-http.strategy.js';
import { BrowserHeadersStrategy } from './fetcher/fetch-strategies/browser-headers.strategy.js';
import { PlaywrightStrategy } from './fetcher/fetch-strategies/playwright.strategy.js';
import { PlaywrightStealthStrategy } from './fetcher/fetch-strategies/playwright-stealth.strategy.js';
import { FetchEscalator } from './fetcher/fetch-escalator.js';
import { RedisRateLimiter } from './fetcher/rate-limiter.js';
import { RobotsTxtCache } from './fetcher/robots-txt-cache.js';
import { createQueueAdapter } from './queue/queue-factory.js';
import { DiscoveryQueue } from './queue/discovery-queue.js';
import { ChangeType } from '@lazyfounders/shared';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('=== LazyFounders Validation Script ===\n');
  
  console.log('1. Initializing Container (Postgres & Redis)...');
  const container = await createContainer();
  const { config, logger, redis } = container;

  try {
    console.log('\n2. Setting up Fetcher Subsystem...');
    
    // Core components
    const fetchClient = new FetchClient({
      ...config.fetcher,
      maxRedirects: 5,
      keepAlive: true,
      maxSockets: 100
    }, logger);
    const uar = new UserAgentRotator();
    const rateLimiter = new RedisRateLimiter(redis, config.fetcher.defaultRateLimitRpm, logger);
    const robotsCache = new RobotsTxtCache(fetchClient, redis, logger);

    // Strategies
    const simple = new SimpleHttpStrategy(fetchClient, logger);
    const browser = new BrowserHeadersStrategy(fetchClient, uar, logger);
    const playwright = new PlaywrightStrategy(config.playwright, logger);
    const stealth = new PlaywrightStealthStrategy(config.playwright, logger);

    // Orchestrator
    const escalator = new FetchEscalator(
      [simple, browser, playwright, stealth], 
      rateLimiter, 
      robotsCache, 
      logger
    );

    console.log('\n3. Testing Rate Limiter & Escalator...');
    const testUrl = 'https://news.ycombinator.com/news';
    console.log(`Fetching: ${testUrl}`);
    
    const result = await escalator.fetch(testUrl, { respectRobotsTxt: false }); // Bypass robots for this test
    
    console.log('\n=== Fetch Result ===');
    console.log(`Status: ${result.statusCode}`);
    console.log(`Strategy used: ${result.strategy}`);
    console.log(`Attempted strategies: ${result.attemptedStrategies.join(' -> ')}`);
    console.log(`Duration: ${Math.round(result.durationMs)}ms`);
    console.log(`Size: ${(result.byteSize / 1024).toFixed(2)} KB`);

    console.log('\n4. Testing Queue Abstraction...');
    const queueAdapter = createQueueAdapter(config, redis, logger);
    const queue = new DiscoveryQueue(queueAdapter, logger);
    
    console.log('Pushing test job to BullMQ...');
    const enqResult = await queue.emitNewUrl({
      traceId: 'test-trace',
      sourceId: uuidv4(),
      domain: 'ycombinator.com',
      url: testUrl,
      urlHash: 'test-hash-123',
      lastmod: new Date().toISOString(),
      changeType: ChangeType.NEW,
      titleHint: 'Test Article',
      newsPublicationDate: null,
      discoveredAt: new Date().toISOString(),
      metadata: {}
    });
    
    console.log(`Job Enqueued! Job ID: ${enqResult.jobId} in queue: ${enqResult.queue}`);
    
    const depth = await queue.getQueueDepth();
    console.log(`Current Queue Depth: ${depth}`);

  } catch (error) {
    console.error('\n❌ Error during validation:', error);
  } finally {
    console.log('\n5. Cleaning up...');
    await container.dispose();
    process.exit(0);
  }
}

main().catch(console.error);
