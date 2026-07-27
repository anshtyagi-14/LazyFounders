export interface ParseResult {
  urls: DiscoveredUrl[];
  sitemaps: DiscoveredSitemap[];
  errors: string[];
}

export interface DiscoveredUrl {
  loc: string;
  lastmod?: Date;
  changefreq?: string;
  priority?: number;
  news?: { title: string; publication_date: string; publication_name: string };
  images?: string[];
}

export interface DiscoveredSitemap {
  loc: string;
  lastmod?: Date;
}
