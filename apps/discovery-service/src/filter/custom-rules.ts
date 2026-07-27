/**
 * Applies custom include and exclude rules to URLs.
 */
export class CustomRulesEngine {
  /**
   * Checks if a URL matches the custom rules.
   * @param url The URL to check.
   * @param includeRegexes Optional array of regex strings to include.
   * @param excludeRegexes Optional array of regex strings to exclude.
   * @returns True if the URL passes the rules, false otherwise.
   */
  public matches(url: string, includeRegexes: string[] = [], excludeRegexes: string[] = []): boolean {
    // Check exclusions first
    for (const pattern of excludeRegexes) {
      const regex = new RegExp(pattern);
      if (regex.test(url)) {
        return false;
      }
    }

    // Check inclusions if provided
    if (includeRegexes.length > 0) {
      for (const pattern of includeRegexes) {
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
          return true;
        }
      }
      return false; // Did not match any inclusion rules
    }

    return true; // No inclusion rules, passes implicitly
  }
}
