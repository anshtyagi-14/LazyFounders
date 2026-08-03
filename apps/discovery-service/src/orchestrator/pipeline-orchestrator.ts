import { Logger } from 'pino';
import { PrismaClient, Source, CrawlRun } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Readable } from 'node:stream';

import { DiscoveryEngine } from '../discovery/discovery-engine';
import { SaxSitemapParser } from '../parser/sax-parser';
import { RegexFallbackParser } from '../parser/regex-fallback';
import { getDecompressedStream } from '../parser/stream-utils';
import { FilterPipeline, SourceConfig } from '../filter/filter-pipeline';
import { DiffEngine } from '../diff/diff-engine';
import { FetchEscalator } from '../fetcher/fetch-escalator';
import { DiscoveredUrl, ParseResult } from '../parser/types';
import { ChangeType, DiffResult } from '../diff/types';

export interface IScraperQueue {
  enqueue(job: { url: string; domain: string; changeType: ChangeType; sourceId: string }): Promise<void>;
}

export class PipelineOrchestrator {
  constructor(
    private readonly discoveryEngine: DiscoveryEngine,
    private readonly saxSitemapParser: SaxSitemapParser,
    private readonly regexFallbackParser: RegexFallbackParser,
    private readonly filterPipeline: FilterPipeline,
    private readonly diffEngine: DiffEngine,
    private readonly fetchEscalator: FetchEscalator,
    private readonly scraperQueue: IScraperQueue,
    private readonly logger: Logger,
    private readonly prisma: PrismaClient
  ) {}

  public async runDiscovery(sourceId: string): Promise<any> {
    this.logger.info({ sourceId }, 'Starting discovery pipeline');
    
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId }
    });

    if (!source) {
      this.logger.error({ sourceId }, 'Source not found in DB');
      throw new Error(`Source ${sourceId} not found`);
    }

    if (!source.enabled) {
      this.logger.info({ sourceId }, 'Source is disabled. Aborting run.');
      return;
    }

    const traceId = randomUUID();
      const maxAgeDays = source.recencyWindowHours / 24;

      const stats: any = {
        newUrls: 0,
        updatedUrls: 0,
        renamedUrls: 0,
        removedUrls: 0,
        unchangedUrls: 0,
        errorCount: 0,
        sitemapsProcessed: 0,
        maxAgeDays
      };

      let crawlRunId: string | null = null;
      
      try {
        const crawlRun = await this.prisma.crawlRun.create({
          data: {
            sourceId: source.id,
            traceId,
            status: 'running',
            startedAt: new Date()
          }
        });
        crawlRunId = crawlRun.id;

        // 2. Run discovery engine
        const sitemaps = await this.discoveryEngine.discover({
          domain: source.domain,
          baseUrl: source.baseUrl,
          sourceId: source.id,
          respectRobotsTxt: true
        });

        const allDiscoveredUrls: DiscoveredUrl[] = [];

        // 3. Process each discovered sitemap
        const sitemapUrlsToProcess = sitemaps.map(s => s.url);
        await this.processSitemaps(sitemapUrlsToProcess, allDiscoveredUrls, stats, crawlRunId);

        // 9. Filter pipeline
        const sourceConfig: SourceConfig = { maxAgeDays };
      
      const filteredUrls = this.filterPipeline.process(allDiscoveredUrls, sourceConfig);
      this.logger.info({ count: filteredUrls.length, sourceId }, 'URLs remaining after filtering');

      // 10. Diff engine
      const diffResults = await this.diffEngine.computeDiff(source.domain, filteredUrls);

      // 11. Process diff results
      for (const result of diffResults) {
        if (
          result.changeType === ChangeType.NEW ||
          result.changeType === ChangeType.UPDATED ||
          result.changeType === ChangeType.RENAMED
        ) {
          const urlHash = Buffer.from(result.url.loc).toString('base64');
          
          await this.prisma.urlState.upsert({
            where: { urlHash },
            create: {
              url: result.url.loc,
              urlHash,
              sourceId: source.id,
              changeType: result.changeType,
              status: 'new'
            },
            update: {
              changeType: result.changeType,
              status: 'active',
              updatedAt: new Date()
            }
          });

          await this.scraperQueue.enqueue({
            url: result.url.loc,
            domain: source.domain,
            changeType: result.changeType,
            sourceId: source.id
          });
        }

        switch (result.changeType) {
          case ChangeType.NEW:
            stats.newUrls++;
            break;
          case ChangeType.UPDATED:
            stats.updatedUrls++;
            break;
          case ChangeType.RENAMED:
            stats.renamedUrls++;
            break;
          case ChangeType.UNCHANGED:
            stats.unchangedUrls++;
            break;
          case ChangeType.REMOVED:
            stats.removedUrls++;
            break;
        }
      }

      // Update source lastCrawledAt
      await this.prisma.source.update({
        where: { id: source.id },
        data: { lastCrawledAt: new Date() }
      });

      this.logger.info({ sourceId, stats }, 'Discovery pipeline completed successfully');

      // 12. Update crawl run
      const finalCrawlRun = await this.prisma.crawlRun.update({
        where: { id: crawlRunId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          totalUrls: filteredUrls.length,
          newUrls: stats.newUrls,
          updatedUrls: stats.updatedUrls,
          removedUrls: stats.removedUrls,
          renamedUrls: stats.renamedUrls,
          unchangedUrls: stats.unchangedUrls,
          errorCount: stats.errorCount,
          sitemapsProcessed: stats.sitemapsProcessed
        }
      });

      return finalCrawlRun;

    } catch (error: any) {
      this.logger.error({ error, sourceId }, 'Error in discovery pipeline');
      stats.errorCount++;

      if (crawlRunId) {
        await this.prisma.crawlRun.update({
          where: { id: crawlRunId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorCount: stats.errorCount
          }
        });
      }
      throw error;
    }
  }

  private async processSitemaps(
    sitemapUrls: string[],
    collectedUrls: DiscoveredUrl[],
    stats: any,
    crawlRunId: string | null,
    visited = new Set<string>()
  ): Promise<void> {
    for (const url of sitemapUrls) {
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        this.logger.debug({ sitemapUrl: url }, 'Fetching sitemap');
        
        // 3. Fetch using FetchEscalator
        const response = await this.fetchEscalator.fetch(url, { respectRobotsTxt: true });
        
        // 4. Decompress stream
        const rawStream = Readable.from(response.body);
        const decompressedStream = getDecompressedStream(rawStream, response.contentEncoding || '');
        
        // 5. Parse
        let parseResult = await this.saxSitemapParser.parseStream(decompressedStream);
        
        // 7. Fallback if errors and no urls
        if (parseResult.errors.length > 0 && parseResult.urls.length === 0) {
          parseResult = await this.regexFallbackParser.parseBuffer(response.body);
        }

        stats.sitemapsProcessed++;
        
        // 8. Collect URLs
        if (parseResult.urls.length > 0) {
          collectedUrls.push(...parseResult.urls);
          
          if (crawlRunId && stats.sitemapsProcessed % 2 === 0) {
            // Update UI periodically during long crawls
            await this.prisma.crawlRun.update({
              where: { id: crawlRunId },
              data: { totalUrls: collectedUrls.length }
            });
          }
        }

        // 6. Recursively process child sitemaps
        if (parseResult.sitemaps.length > 0) {
          // Filter child sitemaps by recency to avoid downloading years of history!
          const recentSitemaps = parseResult.sitemaps.filter(s => {
            if (!s.lastmod) {
              // If no date, try to extract a year from the URL (e.g. sitemap-2023.xml)
              const yearMatch = s.loc.match(/20\d{2}/);
              if (yearMatch) {
                const year = parseInt(yearMatch[0], 10);
                const currentYear = new Date().getFullYear();
                return year >= currentYear - 1; // Only keep current or previous year
              }
              return true; // If no date at all, keep it
            }
            const ageDays = (Date.now() - s.lastmod.getTime()) / (1000 * 60 * 60 * 24);
            return ageDays <= stats.maxAgeDays; 
          });
          
          // Failsafe: if we still have more than 10 sitemaps and none had dates, limit to 10
          // to prevent scraping 142k URLs every 5 minutes.
          const sitemapsToFetch = recentSitemaps.length > 10 && !recentSitemaps[0].lastmod 
            ? recentSitemaps.slice(0, 10) 
            : recentSitemaps;
          
          if (sitemapsToFetch.length > 0) {
            await this.processSitemaps(sitemapsToFetch.map(s => s.loc), collectedUrls, stats, crawlRunId, visited);
          } else if (parseResult.sitemaps.length > 0) {
             this.logger.debug(`Skipped ${parseResult.sitemaps.length} older child sitemaps.`);
          }
        }

      } catch (err: any) {
        this.logger.error({ err, sitemapUrl: url }, 'Failed to process sitemap');
        stats.errorCount++;
      }
    }
  }
}
