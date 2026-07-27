import { UrlNormalizer } from './url-normalizer';
import { ArticleFilter } from './article-filter';
import { RecencyFilter } from './recency-filter';
import { CustomRulesEngine } from './custom-rules';
import type { Logger } from 'pino';

export interface DiscoveredUrl {
  loc: string;
  lastmod?: Date;
  [key: string]: any;
}

export interface SourceConfig {
  maxAgeDays?: number;
  includeRegexes?: string[];
  excludeRegexes?: string[];
  [key: string]: any;
}

/**
 * Orchestrates the filtering of discovered URLs.
 */
export class FilterPipeline {
  /**
   * Initializes the FilterPipeline with necessary dependencies.
   * @param urlNormalizer The URL normalizer instance.
   * @param articleFilter The article filter instance.
   * @param recencyFilter The recency filter instance.
   * @param customRulesEngine The custom rules engine instance.
   * @param logger Optional pino logger.
   */
  constructor(
    private readonly urlNormalizer: UrlNormalizer,
    private readonly articleFilter: ArticleFilter,
    private readonly recencyFilter: RecencyFilter,
    private readonly customRulesEngine: CustomRulesEngine,
    private readonly logger?: Logger
  ) {}

  /**
   * Processes a list of discovered URLs through the filter pipeline.
   * @param discoveredUrls Array of discovered URLs to process.
   * @param sourceConfig Configuration for the source, containing filter settings.
   * @returns Array of filtered and normalized URLs.
   */
  public process(discoveredUrls: DiscoveredUrl[], sourceConfig: SourceConfig): DiscoveredUrl[] {
    const seenUrls = new Set<string>();
    const maxAgeDays = sourceConfig.maxAgeDays ?? 30; // Default to 30 days if not specified
    const includeRegexes = sourceConfig.includeRegexes ?? [];
    const excludeRegexes = sourceConfig.excludeRegexes ?? [];

    const result: DiscoveredUrl[] = [];
    let noDateCount = 0;
    const MAX_NO_DATE_URLS = 100;

    for (const urlObj of discoveredUrls) {
      // 1. Normalize
      const normalizedLoc = this.urlNormalizer.normalize(urlObj.loc);
      
      // 2. Duplicate check within current batch
      if (seenUrls.has(normalizedLoc)) {
        continue;
      }
      
      const normalizedUrlObj = { ...urlObj, loc: normalizedLoc };

      // 3. Article Filter
      if (!this.articleFilter.isArticleUrl(normalizedLoc)) {
        continue;
      }

      // 4. Recency Filter
      if (!this.recencyFilter.isRecentEnough(normalizedUrlObj.lastmod, maxAgeDays)) {
        continue;
      }

      // 4b. Enforce max 100 cap for articles missing dates (poorly formatted sitemaps)
      if (!normalizedUrlObj.lastmod) {
        if (noDateCount >= MAX_NO_DATE_URLS) {
          continue;
        }
        noDateCount++;
      }

      // 5. Custom Rules
      if (!this.customRulesEngine.matches(normalizedLoc, includeRegexes, excludeRegexes)) {
        continue;
      }

      // Passes all filters
      seenUrls.add(normalizedLoc);
      result.push(normalizedUrlObj);
    }

    if (this.logger) {
      this.logger.info(`FilterPipeline processed ${discoveredUrls.length} urls, kept ${result.length}`);
    }

    return result;
  }
}
