import { Logger } from 'pino';
import { RedisBloomFilter } from './bloom-filter';
import { RedisStateStore } from './state-store';
import { ChangeType, DiffResult } from './types';
import { DiscoveredUrl } from '../parser/types';

export class DiffEngine {
  private bloomFilter: RedisBloomFilter;
  private stateStore: RedisStateStore;
  private logger: Logger;

  constructor(
    bloomFilter: RedisBloomFilter,
    stateStore: RedisStateStore,
    logger: Logger
  ) {
    this.bloomFilter = bloomFilter;
    this.stateStore = stateStore;
    this.logger = logger.child({ component: 'DiffEngine' });
  }

  private extractSlug(url: string): string {
    try {
      const parsedUrl = new URL(url);
      // Remove trailing slash, split by /, get last non-empty segment
      const segments = parsedUrl.pathname.replace(/\/$/, '').split('/').filter(Boolean);
      if (segments.length === 0) return parsedUrl.pathname;
      const lastSegment = segments[segments.length - 1];
      // Strip common extensions
      return lastSegment.replace(/\.(html?|php|aspx?|jsp)$/i, '').toLowerCase();
    } catch {
      return url;
    }
  }

  /**
   * Computes the difference between currently discovered URLs and known state.
   * @param domain The domain being processed.
   * @param currentUrls The list of newly discovered URLs.
   * @returns A promise that resolves to a list of DiffResult objects.
   */
  public async computeDiff(domain: string, currentUrls: DiscoveredUrl[]): Promise<DiffResult[]> {
    const results: DiffResult[] = [];

    for (const current of currentUrls) {
      try {
        const urlStr = current.loc;
        const isKnown = await this.bloomFilter.isKnown(domain, urlStr);

        if (!isKnown) {
          const slug = this.extractSlug(urlStr);
          const previousLoc = await this.stateStore.findUrlBySlug(domain, slug);

          if (previousLoc && previousLoc !== urlStr) {
            results.push({
              url: current,
              changeType: ChangeType.RENAMED,
              previousLoc
            });
            
            // Update state for renamed item
            await this.bloomFilter.markKnown(domain, urlStr);
            await this.stateStore.setUrlState(domain, urlStr, current.lastmod);
            await this.stateStore.updateSlugIndex(domain, slug, urlStr);
          } else {
            results.push({
              url: current,
              changeType: ChangeType.NEW
            });
            
            // Update state for new item
            await this.bloomFilter.markKnown(domain, urlStr);
            await this.stateStore.setUrlState(domain, urlStr, current.lastmod);
            await this.stateStore.updateSlugIndex(domain, slug, urlStr);
          }
        } else {
          const storedState = await this.stateStore.getUrlState(domain, urlStr);
          let isUpdated = false;

          if (storedState?.lastmod && current.lastmod) {
            const storedDate = new Date(storedState.lastmod);
            const currentDate = new Date(current.lastmod);
            
            if (currentDate.getTime() > storedDate.getTime()) {
              isUpdated = true;
            }
          } else if (!storedState?.lastmod && current.lastmod) {
            // We have a new lastmod value when we didn't have one before
            isUpdated = true;
          }

          if (isUpdated) {
            results.push({
              url: current,
              changeType: ChangeType.UPDATED
            });
            
            // Update state with new lastmod
            await this.stateStore.setUrlState(domain, urlStr, current.lastmod);
          } else {
            results.push({
              url: current,
              changeType: ChangeType.UNCHANGED
            });
          }
        }
      } catch (error) {
        this.logger.error({ err: error, url: current.loc }, 'Error computing diff for URL');
        // Continue processing remaining URLs for fault tolerance
      }
    }

    return results;
  }
}
