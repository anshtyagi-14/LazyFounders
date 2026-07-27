import { Page } from 'playwright';

/**
 * Handles simulating user scrolling to trigger lazy-loaded content.
 */
export class LazyLoadHandler {
  /**
   * Simulates human scrolling down the page to trigger lazy-loaded images/text.
   *
   * @param page - The Playwright Page instance to interact with.
   * @param maxScrolls - The maximum number of scroll iterations. Default is 5.
   * @param delayMs - Delay in milliseconds between scrolls. Default is 200ms.
   * @returns A promise that resolves when scrolling is complete.
   */
  public static async scrollToBottom(
    page: Page,
    maxScrolls: number = 5,
    delayMs: number = 200
  ): Promise<void> {
    try {
      for (let i = 0; i < maxScrolls; i++) {
        const previousHeight = await page.evaluate(() => document.body.scrollHeight);
        
        // Scroll down by one viewport height
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        
        // Wait for potential lazy loading to trigger
        await page.waitForTimeout(delayMs);
        
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        
        // If the scroll height hasn't changed, we've likely reached the bottom
        if (newHeight === previousHeight) {
          break;
        }
      }
    } catch (error) {
      // Error handling if page context is destroyed during evaluation
      console.warn('LazyLoadHandler encountered an error during scroll evaluation:', error);
    }
  }
}
