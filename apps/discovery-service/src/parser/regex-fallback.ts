import { Logger } from 'pino';
import { ParseResult, DiscoveredUrl, DiscoveredSitemap } from './types';

/**
 * Fallback parser using regular expressions for malformed XML sitemaps.
 */
export class RegexFallbackParser {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parses a buffer containing sitemap data using regular expressions.
   * @param buffer The buffer to parse.
   * @returns A promise resolving to the parsed result.
   */
  public async parseBuffer(buffer: Buffer): Promise<ParseResult> {
    this.logger.warn('Using RegexFallbackParser to parse sitemap due to XML errors.');
    
    const result: ParseResult = {
      urls: [],
      sitemaps: [],
      errors: [],
    };

    const content = buffer.toString('utf-8');

    // Extract urls
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlRegex.exec(content)) !== null) {
      const urlContent = urlMatch[1];
      const loc = this.extractTagContent(urlContent, 'loc');
      
      if (loc) {
        const lastmodStr = this.extractTagContent(urlContent, 'lastmod');
        const url: DiscoveredUrl = {
          loc: loc.trim(),
        };
        
        if (lastmodStr) {
          const date = new Date(lastmodStr.trim());
          if (!isNaN(date.getTime())) {
            url.lastmod = date;
          }
        }
        
        result.urls.push(url);
      }
    }

    // Extract sitemaps
    const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
    let sitemapMatch: RegExpExecArray | null;
    while ((sitemapMatch = sitemapRegex.exec(content)) !== null) {
      const sitemapContent = sitemapMatch[1];
      const loc = this.extractTagContent(sitemapContent, 'loc');
      
      if (loc) {
        const lastmodStr = this.extractTagContent(sitemapContent, 'lastmod');
        const sitemap: DiscoveredSitemap = {
          loc: loc.trim(),
        };
        
        if (lastmodStr) {
          const date = new Date(lastmodStr.trim());
          if (!isNaN(date.getTime())) {
            sitemap.lastmod = date;
          }
        }
        
        result.sitemaps.push(sitemap);
      }
    }

    this.logger.info(`Regex parsing completed. Found ${result.urls.length} URLs and ${result.sitemaps.length} sitemaps.`);
    return result;
  }

  /**
   * Helper to extract content of a specific tag
   */
  private extractTagContent(content: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = regex.exec(content);
    return match ? match[1] : null;
  }
}
