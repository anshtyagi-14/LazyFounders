import { SaxesParser, SaxesTag } from 'saxes';
import { Logger } from 'pino';
import { Readable } from 'stream';
import { ParseResult, DiscoveredUrl, DiscoveredSitemap } from './types';

/**
 * SAX-based streaming XML parser for sitemaps.
 */
export class SaxSitemapParser {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parses a readable stream of a sitemap.
   * @param stream The readable stream to parse.
   * @returns A promise resolving to the parsed result.
   */
  public async parseStream(stream: Readable): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const result: ParseResult = {
        urls: [],
        sitemaps: [],
        errors: [],
      };

      const parser = new SaxesParser();
      
      let currentTag: string | null = null;
      let inUrl = false;
      let inSitemap = false;
      
      // Temporary objects to hold current entity data
      let currentUrl: Partial<DiscoveredUrl> = {};
      let currentSitemap: Partial<DiscoveredSitemap> = {};
      
      let currentNews: any = null;
      
      parser.on('opentag', (tag: SaxesTag) => {
        currentTag = tag.name.toLowerCase();
        
        if (currentTag === 'url' || currentTag === 'item' || currentTag === 'entry') {
          inUrl = true;
          currentUrl = { images: [] };
        } else if (currentTag === 'sitemap') {
          inSitemap = true;
          currentSitemap = {};
        } else if (currentTag === 'news:news' && inUrl) {
          currentNews = {};
        } else if (currentTag === 'link' && inUrl && tag.attributes.href) {
          // Atom feed <link href="...">
          currentUrl.loc = (tag.attributes.href as string).trim();
        }
      });
      
      parser.on('text', (text: string) => {
        const trimmedText = text.trim();
        if (!trimmedText || !currentTag) return;
        
        if (inUrl) {
          if (currentNews) {
            if (currentTag === 'news:title') {
              currentNews.title = (currentNews.title || '') + trimmedText;
            } else if (currentTag === 'news:publication_date') {
              currentNews.publication_date = (currentNews.publication_date || '') + trimmedText;
            } else if (currentTag === 'news:name' || currentTag === 'news:publication_name') {
              currentNews.publication_name = (currentNews.publication_name || '') + trimmedText;
            }
          } else {
            switch (currentTag) {
              case 'loc':
              case 'link':
                // For RSS <link>...</link> or Sitemap <loc>
                currentUrl.loc = (currentUrl.loc || '') + trimmedText;
                break;
              case 'lastmod':
              case 'pubdate':
              case 'updated':
                currentUrl.lastmod = this.parseDate(trimmedText) || currentUrl.lastmod;
                break;
              case 'changefreq':
                currentUrl.changefreq = (currentUrl.changefreq || '') + trimmedText;
                break;
              case 'priority': {
                const priority = parseFloat(trimmedText);
                if (!isNaN(priority)) {
                  currentUrl.priority = priority;
                }
                break;
              }
              case 'image:loc':
                if (currentUrl.images) {
                  currentUrl.images.push(trimmedText);
                }
                break;
            }
          }
        } else if (inSitemap) {
          switch (currentTag) {
            case 'loc':
              currentSitemap.loc = (currentSitemap.loc || '') + trimmedText;
              break;
            case 'lastmod':
              currentSitemap.lastmod = this.parseDate(trimmedText) || currentSitemap.lastmod;
              break;
          }
        }
      });
      
      parser.on('closetag', (tag: SaxesTag) => {
        const tagName = tag.name.toLowerCase();
        
        if (tagName === 'url' || tagName === 'item' || tagName === 'entry') {
          if (currentUrl.loc) {
            // Clean up potentially concatenated whitespace in link tags
            currentUrl.loc = currentUrl.loc.trim();
            
            if (currentNews && currentNews.title && currentNews.publication_date && currentNews.publication_name) {
                currentUrl.news = {
                    title: currentNews.title,
                    publication_date: currentNews.publication_date,
                    publication_name: currentNews.publication_name
                };
            }
            result.urls.push(currentUrl as DiscoveredUrl);
          }
          inUrl = false;
          currentUrl = {};
          currentNews = null;
        } else if (tagName === 'sitemap') {
          if (currentSitemap.loc) {
            result.sitemaps.push(currentSitemap as DiscoveredSitemap);
          }
          inSitemap = false;
          currentSitemap = {};
        } else if (tagName === 'news:news') {
           // News tag closed, we keep currentNews until url closes
        }
        
        currentTag = null;
      });
      
      parser.on('error', (err: Error) => {
        this.logger.error(`SAX Parser Error: ${err.message}`);
        result.errors.push(err.message);
      });
      
      stream.on('data', (chunk: Buffer | string) => {
        try {
          parser.write(chunk.toString());
        } catch (err: any) {
           this.logger.error(`Stream chunk parsing error: ${err.message}`);
           result.errors.push(err.message);
        }
      });
      
      stream.on('end', () => {
        try {
          parser.close();
        } catch (err: any) {
          this.logger.error(`Error closing parser: ${err.message}`);
          result.errors.push(err.message);
        }
        this.logger.info({ 
          urlsCount: result.urls.length, 
          sitemapsCount: result.sitemaps.length,
          errorsCount: result.errors.length
        }, 'SAX parser finished parsing stream');
        resolve(result);
      });
      
      stream.on('error', (err: Error) => {
        this.logger.error(`Stream Error: ${err.message}`);
        reject(err);
      });
    });
  }

  private parseDate(dateString: string): Date | undefined {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return undefined;
  }
}
