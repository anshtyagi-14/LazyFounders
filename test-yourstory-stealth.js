import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('Navigating...');
  await page.goto('https://yourstory.com/2024/01/india-tech-startups-funding-winter', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const text = await page.evaluate(() => {
    // Try standard P tags
    let pTags = Array.from(document.querySelectorAll('p')).map(p => p.innerText).join('\n');
    
    // Try looking for JSON hydration (Next.js)
    let nextData = document.getElementById('__NEXT_DATA__');
    let jsonLength = nextData ? nextData.innerText.length : 0;
    
    return { pTagsLength: pTags.length, jsonLength };
  });
  
  console.log(text);
  await browser.close();
})();
