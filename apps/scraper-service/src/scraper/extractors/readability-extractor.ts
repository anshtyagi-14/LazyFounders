import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { ExtractedArticle } from '../types';

/**
 * Extractor that uses Mozilla Readability to pull main article content from HTML.
 */
export class ReadabilityExtractor {
  /**
   * Extracts clean article text, html, title, and other metadata from raw HTML.
   * 
   * @param html - The raw HTML string of the webpage.
   * @param url - The URL of the webpage, used for relative links resolution.
   * @returns A partial ExtractedArticle containing the extracted data, or an empty object on failure.
   */
  public extract(html: string, url: string): Partial<ExtractedArticle> {
    try {
      const doc = new JSDOM(html, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();

      if (!article) {
        return {};
      }

      return {
        title: article.title || undefined,
        textContent: article.textContent || undefined,
        htmlContent: article.content || undefined,
        excerpt: article.excerpt || undefined,
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
      };
    } catch (error) {
      console.error('ReadabilityExtractor failed:', error);
      return {};
    }
  }
}
