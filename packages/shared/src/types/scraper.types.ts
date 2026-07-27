export interface ScrapedImage {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface OpenGraphData {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
  siteName: string | null;
  locale: string | null;
}

export interface TwitterCardData {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
  creator: string | null;
}

export interface BreadcrumbItem {
  name: string;
  url: string | null;
}

export interface ScrapedContent {
  url: string;
  title: string | null;
  subtitle: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  author: string | null;
  publishedDate: string | null;
  language: string | null;
  wordCount: number | null;
  readingTimeMin: number | null;
  images: ScrapedImage[];
  metaTags: Record<string, string>;
  openGraph: OpenGraphData | null;
  twitterCard: TwitterCardData | null;
  canonicalUrl: string | null;
  jsonLd: unknown[] | null;
  articleSchema: unknown | null;
  breadcrumbs: BreadcrumbItem[] | null;
  contentHash: string | null;
  extractionMethod: string;
  fetchStrategy: string;
  durationMs: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage: string | null;
  rawHtmlSize: number | null;
}
