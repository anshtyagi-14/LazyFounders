/**
 * Normalizes URLs for consistency.
 */
export class UrlNormalizer {
  private readonly trackingParams = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', '_ga'
  ]);

  /**
   * Normalizes a given URL.
   * Forces https unless localhost, lowercases hostname, removes tracking params, hashes, and trailing slashes.
   * @param urlString The URL to normalize.
   * @returns The normalized URL.
   */
  public normalize(urlString: string): string {
    try {
      let url = urlString;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      const parsed = new URL(url);

      if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        parsed.protocol = 'https:';
      }

      parsed.hostname = parsed.hostname.toLowerCase();
      parsed.hash = '';

      const keysToDelete: string[] = [];
      parsed.searchParams.forEach((_, key) => {
        if (this.trackingParams.has(key)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => parsed.searchParams.delete(key));

      let normalized = parsed.toString();
      if (normalized.length > parsed.origin.length + 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }

      return normalized;
    } catch (error) {
      // Return original if malformed
      return urlString;
    }
  }
}
