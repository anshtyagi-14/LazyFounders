import * as cheerio from 'cheerio';
import { ExtractedArticle } from '../types';

/**
 * Extractor that uses custom CSS selectors to extract specific fields.
 * Useful for publishers with non-standard HTML structures.
 */
export class CustomPluginExtractor {
  /**
   * Extracts data using custom CSS selectors.
   * 
   * @param html - The raw HTML string.
   * @param selectors - A record mapping ExtractedArticle fields to CSS selectors.
   * @returns A partial ExtractedArticle containing the extracted data.
   */
  public extract(html: string, selectors: Record<string, string>): Partial<ExtractedArticle> {
    const $ = cheerio.load(html);
    const result: Partial<ExtractedArticle> = {};

    for (const [field, selector] of Object.entries(selectors)) {
      try {
        const text = $(selector).text().trim();
        if (text) {
          // Cast the field as keyof ExtractedArticle to assign it dynamically, 
          // but we only support string fields here easily.
          // For a fully robust solution, one might handle date parsing for publishedTime etc.
          if (['title', 'textContent', 'htmlContent', 'excerpt', 'byline', 'siteName', 'language'].includes(field)) {
            (result as any)[field] = text;
          }
        }
      } catch (error) {
        console.warn(`Failed to extract field ${field} using selector ${selector}`, error);
      }
    }

    // Handle HTML content separately if requested
    if (selectors.htmlContent) {
      try {
        const htmlContent = $(selectors.htmlContent).html();
        if (htmlContent) {
          result.htmlContent = htmlContent.trim();
        }
      } catch (error) {
         console.warn(`Failed to extract HTML content using selector ${selectors.htmlContent}`, error);
      }
    }

    return result;
  }
}
