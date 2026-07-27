/**
 * Filters URLs to determine if they are likely articles.
 */
export class ArticleFilter {
  private readonly nonArticlePaths = [
    '/category/', '/author/', '/tag/', '/login', '/register', 
    '/cart', '/checkout', '/about', '/contact', '/privacy', '/terms'
  ];

  private readonly nonHtmlExtensions = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp4', '.avi', '.mov', '.webm', '.mp3', '.wav', '.ogg',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.css', '.js', '.json', '.xml'
  ]);

  /**
   * Checks if a URL is likely to be an article based on common patterns.
   * @param urlString The URL to check.
   * @returns True if it might be an article, false otherwise.
   */
  public isArticleUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      const pathname = url.pathname.toLowerCase();

      // Exclude common non-article paths
      for (const path of this.nonArticlePaths) {
        if (pathname.includes(path)) {
          return false;
        }
      }

      // Exclude common non-html extensions
      const parts = pathname.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        const extIndex = lastPart.lastIndexOf('.');
        if (extIndex !== -1) {
          const ext = lastPart.substring(extIndex);
          if (this.nonHtmlExtensions.has(ext)) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}
