export enum SitemapType {
  URLSET = 'URLSET',
  SITEMAPINDEX = 'SITEMAPINDEX',
  RSS = 'RSS',
  ATOM = 'ATOM',
}

export enum DiscoveryMethod {
  ROBOTS_TXT = 'ROBOTS_TXT',
  ENDPOINT_PROBE = 'ENDPOINT_PROBE',
  CMS_DETECTION = 'CMS_DETECTION',
  RSS_FEED = 'RSS_FEED',
  ATOM_FEED = 'ATOM_FEED',
  HEURISTIC = 'HEURISTIC',
  MANUAL = 'MANUAL',
}

export interface SitemapInfo {
  url: string;
  type: SitemapType;
  discoveryMethod: DiscoveryMethod;
}

export interface SitemapImage {
  loc: string;
  caption: string | null;
  title: string | null;
}

export interface AlternateUrl {
  href: string;
  hreflang: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: number | null;
  newsTitle: string | null;
  newsPublicationDate: string | null;
  newsKeywords: string[] | null;
  images: SitemapImage[] | null;
  alternateLanguageUrls: AlternateUrl[] | null;
}

export interface SitemapParseResult {
  type: SitemapType;
  entries: SitemapEntry[];
  childSitemaps: string[];
}
