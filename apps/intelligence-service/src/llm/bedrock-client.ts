import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Logger } from 'pino';

export interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateOfId: string | null;
}

export interface RewrittenArticle {
  seoTitle: string;
  slug: string;
  bodyMarkdown: string;
  metaDescription: string;
  keywords: string[];
  companies: string[];
}

export class BedrockClient {
  private client: BedrockRuntimeClient;
  private readonly modelId = 'amazon.nova-micro-v1:0';

  constructor(private readonly logger: Logger) {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'ap-south-1',
    });
  }

  private async invokeModel(systemPrompt: string, userPrompt: string): Promise<string> {
    const payload = {
      system: [{ text: systemPrompt }],
      messages: [
        { role: 'user', content: [{ text: userPrompt }] }
      ],
      inferenceConfig: {
        max_new_tokens: 5120,
        temperature: 0.2, // Low temperature for deterministic JSON output
        top_p: 0.9,
      }
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.output.message.content[0].text;
    } catch (error: any) {
      this.logger.error({ err: error }, 'Error calling Bedrock LLM');
      throw error;
    }
  }

  async checkDuplicate(
    newArticleTitle: string,
    newArticleSummary: string,
    recentArticles: { id: string; title: string; summary: string }[]
  ): Promise<DeduplicationResult> {
    if (recentArticles.length === 0) {
      return { isDuplicate: false, duplicateOfId: null };
    }

    const systemPrompt = `You are an AI deduplication engine for a news platform.
Your task is to determine if a NEW article is covering the EXACT same specific news event as any of the RECENT articles.
- Covering the same broad topic does NOT make it a duplicate.
- Covering the exact same funding round, product launch, or specific announcement IS a duplicate.
Output MUST be valid JSON with two fields:
{
  "isDuplicate": boolean,
  "duplicateOfId": string or null (the ID of the matching recent article, if any)
}`;

    const recentArticlesText = recentArticles
      .map(a => `ID: ${a.id}\nTitle: ${a.title}\nSummary: ${a.summary}\n---`)
      .join('\n');

    const userPrompt = `RECENT ARTICLES:
${recentArticlesText}

NEW ARTICLE:
Title: ${newArticleTitle}
Summary: ${newArticleSummary}

Is the NEW ARTICLE a duplicate of any RECENT ARTICLES? Reply only in JSON.`;

    try {
      const resultText = await this.invokeModel(systemPrompt, userPrompt);
      const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned) as DeduplicationResult;
    } catch (error) {
      this.logger.error('Failed to parse deduplication JSON result. Defaulting to not duplicate.');
      return { isDuplicate: false, duplicateOfId: null };
    }
  }

  async rewriteArticle(rawText: string, category: string): Promise<RewrittenArticle> {
    const systemPrompt = `You are an expert SEO content writer and journalist.
Your task is to rewrite the provided raw article text into a highly engaging, original, and SEO-optimized article. You must strictly follow this FINAL BLOG STRUCTURE CHECKLIST.

CHECKLIST & CONSTRAINTS:
1. SEO Title: 50-60 characters, must include the focus keyword.
2. Meta Description: 120-160 characters, focus keyword in the first clause.
3. Slug: Short, lowercase, hyphen-separated.
4. Word Count: 1700-2000 words (MINIMUM 1700). If the raw content is shorter, you MUST expand each section with additional detail, examples, and explanations to reach this count.
5. Tone: Professional, Informative, Student-friendly.
6. Year References: Use 2026 throughout the article.
7. Originality: 100% original content. Do NOT copy-paste from the raw text.

8. Companies: Extract an array of ONLY the exact names of startups, tech companies, or VC firms this article is about (e.g. ['Zomato', 'Peak XV']). Do not include generic topics or people.

HTML BODY STRUCTURE (All of this goes inside the "bodyMarkdown" JSON field):
- Write the article in standard Markdown format instead of HTML. This is critical to save tokens.
- IMPORTANT: Since the output is JSON, you MUST use explicit \`\\n\\n\` characters for line breaks. Do NOT output a single continuous string. Separate every heading, paragraph, and list with \`\\n\\n\`.
- Featured Image: Start with an image markdown tag: \`![alt text](placeholder-featured.jpg)\`. Filename and ALT text must contain the focus keyword.
- 30 SEC SUMMARY: Provide an 80-120 word bulleted summary. You MUST wrap this entire section in exactly: \`<div class="summary-box"><h3>30 SEC SUMMARY</h3><ul>...</ul></div>\`
- TABLE OF CONTENTS: Add a table of contents with numbered links. You MUST wrap this entire section in exactly: \`<div class="table-of-contents"><h3>TABLE OF CONTENTS</h3><ol>...</ol></div>\`
- KEY HIGHLIGHTS: Add a bulleted list of 3-5 key highlights. You MUST wrap this entire section in exactly: \`<div class="key-highlights"><h3>KEY HIGHLIGHTS</h3><ul>...</ul></div>\`
- Heading Hierarchy: Use # -> ## -> ### for the main article body. At least 1 subheading must contain the focus keyword.
- Paragraphs: Write detailed, in-depth paragraphs (at least 6-8 lines or 150+ words per section) that fully explain the topic. Do NOT write short or thin content. Use active voice and maintain an engaging tone.
- Table / Comparison Block: Include a minimum of 1 Markdown table.
- Links: 
  - Internal Links: Add 7-10 internal markdown links naturally placed in sentences.
  - External Link: Add a minimum of 1 link to an authoritative source.
- Inline Images: Insert section-wise screenshot placeholders: \`![alt text](placeholder-inline.jpg)\`.
- FAQ Section: Add a section with a minimum of 3 SEO-optimized Q&A pairs.
- Conclusion: 100-150 words.
- Call-to-Action: Direct the reader to blogy.in at the very end.

Output MUST be valid JSON in this exact structure:
{
  "seoTitle": "string",
  "slug": "string",
  "metaDescription": "string",
  "keywords": ["string", "string"],
  "companies": ["string", "string"],
  "bodyMarkdown": "string (markdown formatted following the strict checklist above)"
}`;

    const userPrompt = `CATEGORY: ${category}
    
RAW ARTICLE TEXT:
${rawText}

Rewrite this article and return the JSON.`;

    try {
      const resultText = await this.invokeModel(systemPrompt, userPrompt);
      const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned) as RewrittenArticle;
    } catch (error) {
      this.logger.error('Failed to parse rewrite JSON result.');
      throw new Error('Failed to generate original content');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const payload = {
      inputText: text
    };

    const command = new InvokeModelCommand({
      modelId: 'amazon.titan-embed-text-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.embedding;
    } catch (error: any) {
      this.logger.error({ err: error }, 'Error generating embedding from Bedrock');
      throw error;
    }
  }
}
