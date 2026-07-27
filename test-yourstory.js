import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://yourstory.com/2024/01/india-tech-startups-funding-winter', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const html = await page.content();
  fs.writeFileSync('ys.html', html);
  await browser.close();
})();
