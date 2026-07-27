export interface NormalizedUrl {
  original: string;
  normalized: string;
  urlHash: string;
  domain: string;
  path: string;
  slug: string;
  normalizedSlug: string;
}

export interface UrlFilterResult {
  url: NormalizedUrl;
  passed: boolean;
  reason: string | null;
}
