/**
 * Filters articles based on their recency.
 */
export class RecencyFilter {
  /**
   * Checks if a given date is within the maximum age.
   * @param lastmod The last modification date.
   * @param maxAgeDays The maximum age in days.
   * @returns True if the article is recent enough or if date is unknown.
   */
  public isRecentEnough(lastmod: Date | undefined, maxAgeDays: number): boolean {
    if (!lastmod) {
      return true;
    }

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastmod.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    return diffDays <= maxAgeDays;
  }
}
