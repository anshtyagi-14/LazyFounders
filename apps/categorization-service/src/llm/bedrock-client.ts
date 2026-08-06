import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Logger } from 'pino';

export interface CategorizationResult {
  primaryCategory: string;
  tags: string[];
  summary: string;
  entities: string[];
  sentiment: string;
  confidenceScore: number;
}

export class BedrockClient {
  private client: BedrockRuntimeClient;
  private readonly modelId = 'apac.amazon.nova-micro-v1:0';

  constructor(private readonly logger: Logger) {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      // Credentials automatically loaded from process.env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    });
  }

  public async categorizeByUrl(url: string): Promise<CategorizationResult> {
    const systemPrompt = `You are an expert content categorization AI.
Read the following URL slug and extract the required metadata.

Analyze the URL and provide the following:
1. primaryCategory: The main category (e.g. Technology, Startup, Finance, Health)
2. tags: Up to 5 specific tags (e.g. Artificial Intelligence, Funding)
3. summary: A concise 2-sentence guess of what the article is about based on the slug.
4. entities: Key people, companies, or products mentioned in the slug.
5. sentiment: Positive, Negative, or Neutral.
6. confidenceScore: Your confidence in this categorization (0.0 to 1.0).

You MUST respond with ONLY a valid JSON object matching this schema:
{
  "primaryCategory": "string",
  "tags": ["string"],
  "summary": "string",
  "entities": ["string"],
  "sentiment": "string",
  "confidenceScore": number
}

Do NOT include any conversational text or markdown formatting blocks (like \`\`\`json). Output the raw JSON directly.`;

    const userPrompt = `URL to Analyze: ${url}`;

    try {
      const command = new ConverseCommand({
        modelId: this.modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }]
          }
        ],
        system: [{ text: systemPrompt }],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.1,
        }
      });

      const response = await this.client.send(command);
      
      const responseText = response.output?.message?.content?.[0]?.text;
      
      if (!responseText) {
        throw new Error('Empty response from model');
      }

      const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanJson) as CategorizationResult;

    } catch (error: any) {
      this.logger.error({ error: error.message, stack: error.stack }, 'Failed to invoke AWS Bedrock');
      throw new Error(`Failed to process AI categorization: ${error.message}`);
    }
  }

  public async categorizeByText(text: string): Promise<CategorizationResult> {
    const systemPrompt = `You are an expert content categorization AI.
Read the following article text and extract the required metadata.

Analyze the text and provide the following:
1. primaryCategory: The main category (e.g. Technology, Startup, Finance, Health)
2. tags: Up to 5 specific tags (e.g. Artificial Intelligence, Funding)
3. summary: A concise 2-sentence summary of what the article is about.
4. entities: Key people, companies, or products mentioned in the text.
5. sentiment: Positive, Negative, or Neutral.
6. confidenceScore: Your confidence in this categorization (0.0 to 1.0).

You MUST respond with ONLY a valid JSON object matching this schema:
{
  "primaryCategory": "string",
  "tags": ["string"],
  "summary": "string",
  "entities": ["string"],
  "sentiment": "string",
  "confidenceScore": number
}

Do NOT include any conversational text or markdown formatting blocks (like \`\`\`json). Output the raw JSON directly.`;

    const userPrompt = `Text to Analyze:\n\n${text.substring(0, 8000)}`; // limit context size

    try {
      const command = new ConverseCommand({
        modelId: this.modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: userPrompt }]
          }
        ],
        system: [{ text: systemPrompt }],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.1,
        }
      });

      const response = await this.client.send(command);
      const responseText = response.output?.message?.content?.[0]?.text;
      
      if (!responseText) throw new Error('Empty response from model');

      const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanJson) as CategorizationResult;

    } catch (error: any) {
      this.logger.error({ error: error.message, stack: error.stack }, 'Failed to invoke AWS Bedrock for text categorization');
      throw new Error(`Failed to process AI categorization: ${error.message}`);
    }
  }
}
