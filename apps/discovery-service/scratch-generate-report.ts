import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const artifactPath = '/Users/ansh/.gemini/antigravity/brain/99d73cdd-fae2-4d89-98f4-69dc62e0462e/inc42_results.md';

async function main() {
  console.log('Waiting for Inc42 articles to be extracted and saved to PostgreSQL...');
  let results = [];
  
  // Poll until we have at least 3 results
  for (let i = 0; i < 120; i++) {
    results = await prisma.scrapeResult.findMany({
      include: { urlState: true },
      orderBy: { scrapedAt: 'desc' },
      take: 10
    });
    
    if (results.length >= 3) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  if (results.length === 0) {
    console.log('No results found after waiting.');
    return;
  }

  console.log(`Found ${results.length} extracted articles. Generating markdown report...`);

  let markdown = `# Inc42 Extraction Results\n\n`;
  markdown += `This report contains a live snapshot of the data extracted from Inc42.com during our end-to-end dry run. The data was fetched using the **Discovery Engine**, processed by the **Playwright Scraper**, and saved directly to the **PostgreSQL** database.\n\n`;

  markdown += `## Extracted Metadata Overview\n\n`;
  markdown += `| Title | Author | Words | Read Time | URL |\n`;
  markdown += `|-------|--------|-------|-----------|-----|\n`;

  for (const row of results) {
    markdown += `| ${row.title || 'N/A'} | ${row.author || 'N/A'} | ${row.wordCount || 'N/A'} | ${row.readingTimeMin || 'N/A'} min | [Link](${row.urlState.url}) |\n`;
  }

  markdown += `\n## Sample Extracted Article Text\n\n`;
  markdown += `Below is a sample of the clean, raw text extracted from one of the articles by Mozilla Readability. Notice how all ads, navbars, and junk are stripped away!\n\n`;

  if (results[0] && results[0].bodyText) {
    markdown += `> [!NOTE]\n> **Title:** ${results[0].title}\n> **URL:** ${results[0].urlState.url}\n\n`;
    const snippet = results[0].bodyText.substring(0, 1000) + '...\n\n*(Truncated for readability)*';
    markdown += `\`\`\`text\n${snippet}\n\`\`\`\n`;
  }

  fs.writeFileSync(artifactPath, markdown, 'utf8');
  console.log(`Report successfully written to ${artifactPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
