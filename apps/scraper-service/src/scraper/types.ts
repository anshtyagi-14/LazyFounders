export interface ExtractedArticle {
  title: string;
  textContent: string;
  htmlContent: string;
  excerpt?: string;
  byline?: string;
  siteName?: string;
  publishedTime?: Date;
  modifiedTime?: Date;
  authors?: string[];
  images?: string[];
  language?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsonLd?: any[];
}
