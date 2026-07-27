import * as cheerio from 'cheerio';
import { ExtractedArticle } from '../types';

/**
 * Extractor that uses Cheerio to parse metadata, OpenGraph, Twitter Cards, and JSON-LD.
 */
export class CheerioExtractor {
  /**
   * Extracts metadata from the provided HTML.
   * 
   * @param html - The raw HTML string.
   * @returns A partial ExtractedArticle containing the extracted metadata.
   */
  public extract(html: string): Partial<ExtractedArticle> {
    const $ = cheerio.load(html);
    const result: Partial<ExtractedArticle> = {};

    // 1. Standard Metadata
    const description = $('meta[name="description"]').attr('content');
    if (description) result.excerpt = description;

    const author = $('meta[name="author"]').attr('content');
    if (author) result.authors = [author];

    // 2. OpenGraph
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) result.title = ogTitle;

    const ogSiteName = $('meta[property="og:site_name"]').attr('content');
    if (ogSiteName) result.siteName = ogSiteName;

    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) result.images = [ogImage];

    const pubTime = $('meta[property="article:published_time"]').attr('content');
    if (pubTime) {
      const date = new Date(pubTime);
      if (!isNaN(date.getTime())) result.publishedTime = date;
    }

    const modTime = $('meta[property="article:modified_time"]').attr('content');
    if (modTime) {
      const date = new Date(modTime);
      if (!isNaN(date.getTime())) result.modifiedTime = date;
    }

    const articleAuthor = $('meta[property="article:author"]').attr('content');
    if (articleAuthor) {
      result.authors = result.authors ? [...result.authors, articleAuthor] : [articleAuthor];
    }

    // 3. Twitter Cards
    const twitterTitle = $('meta[name="twitter:title"]').attr('content');
    if (twitterTitle && !result.title) result.title = twitterTitle;

    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    if (twitterImage) {
      result.images = result.images ? [...result.images, twitterImage] : [twitterImage];
    }

    // 4. JSON-LD
    const jsonLdScripts = $('script[type="application/ld+json"]');
    if (jsonLdScripts.length > 0) {
      result.jsonLd = [];
      jsonLdScripts.each((_, el) => {
        try {
          const text = $(el).html();
          if (text) {
            const parsed = JSON.parse(text);
            result.jsonLd?.push(parsed);
          }
        } catch (error) {
          console.warn('Failed to parse JSON-LD script tag', error);
        }
      });
    }

    return result;
  }
}
