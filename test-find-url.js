import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://yourstory.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const url = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/2025/"]');
    return link ? link.href : null;
  });
  
  console.log('Found URL:', url);
  await browser.close();
})();
