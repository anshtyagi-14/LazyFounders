import { Page } from 'playwright';

/**
 * Handles attempting to accept cookie consent banners on web pages.
 */
export class CookieConsentHandler {
  /**
   * Common phrases used on cookie consent buttons to accept all cookies.
   */
  private static readonly ACCEPT_TEXTS = [
    'Accept All',
    'Accept Cookies',
    'Allow All',
    'I Accept',
    'Got it',
    'Agree'
  ];

  /**
   * Attempts to find and click a cookie consent acceptance button.
   *
   * @param page - The Playwright Page instance to interact with.
   * @returns A promise that resolves to true if a button was clicked, false otherwise.
   */
  public static async acceptCookies(page: Page): Promise<boolean> {
    for (const text of CookieConsentHandler.ACCEPT_TEXTS) {
      try {
        // Create a locator targeting elements that might act as a button
        const locator = page.locator('button, a, [role="button"]', { hasText: text });
        
        // Find the first element that is visible
        const count = await locator.count();
        for (let i = 0; i < count; i++) {
          const el = locator.nth(i);
          const isVisible = await el.isVisible().catch(() => false);
          
          if (isVisible) {
            // Click with a short timeout to prevent hanging
            await el.click({ timeout: 1500 });
            // Return immediately after the first successful click
            return true;
          }
        }
      } catch (error) {
        // Catch interaction errors (e.g., element intercepted) and try next text
        continue;
      }
    }
    return false;
  }
}
