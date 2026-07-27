import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Logger } from 'pino';

export interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateOfId: string | null;
}

export interface RewrittenArticle {
  seoTitle: string;
  slug: string;
  bodyHtml: string;
  metaDescription: string;
  keywords: string[];
}

export class BedrockClient {
  private client: BedrockRuntimeClient;
  private readonly modelId = 'apac.amazon.nova-micro-v1:0';

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
        max_new_tokens: 4000,
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
Your task is to rewrite the provided raw article text into a highly engaging, original, and SEO-optimized article.

INSTRUCTIONS:
1. Write a compelling, click-worthy SEO Title (under 60 chars).
2. Create an SEO-friendly URL slug (kebab-case).
3. Write a concise Meta Description (under 160 chars).
4. Extract 3-5 highly relevant SEO keywords.
5. Write the full article body in clean HTML format. 
   - Use <h2> and <h3> tags for structuring.
   - Do NOT wrap the entire output in <html> or <body> tags, just the content.
   - Use <p> tags for paragraphs.
   - Maintain a professional, journalistic tone.
   - Do NOT fabricate facts. Keep all numbers, names, and quotes accurate.

Output MUST be valid JSON in this exact structure:
{
  "seoTitle": "string",
  "slug": "string",
  "metaDescription": "string",
  "keywords": ["string", "string"],
  "bodyHtml": "string (html formatted)"
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
}
