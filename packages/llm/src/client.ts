import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock, AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
  InvokeModelCommand,
  type Message,
  type Tool,
  type ToolChoice,
} from '@aws-sdk/client-bedrock-runtime';
import { toJSONSchema as zToJsonSchema, type z } from 'zod/v4';

export type LlmTask = 'extract' | 'translate' | 'generate' | 'dedup';

export interface LlmTaskConfig {
  model: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
}

export interface StructuredRequest<T> {
  task: LlmTask;
  promptVersion: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  promptVersion: string;
  usage: LlmUsage;
  attempts: number;
}

export interface LlmClient {
  structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export interface EmbeddingClient {
  readonly model: string;
  embed(text: string): Promise<number[]>;
}

/** Output failed schema validation after the bounded repair retry. Never publishable. */
export class LlmOutputError extends Error {
  readonly retryable = false;
  constructor(
    message: string,
    readonly issues: unknown,
    readonly model: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'LlmOutputError';
  }
}

/** The model declined the request. Terminal for this input; goes to editorial review. */
export class LlmRefusalError extends Error {
  readonly retryable = false;
  constructor(message: string, readonly model: string) {
    super(message);
    this.name = 'LlmRefusalError';
  }
}

/** Throttling / network / 5xx. The job layer retries these with backoff. */
export class LlmTransientError extends Error {
  readonly retryable = true;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LlmTransientError';
  }
}

/** Daily token budget exhausted. Retryable later (the budget resets). */
export class LlmBudgetExceededError extends Error {
  readonly retryable = true;
  constructor(message = 'LLM daily token budget exhausted') {
    super(message);
    this.name = 'LlmBudgetExceededError';
  }
}

const DEFAULT_MODEL = 'anthropic.claude-opus-5';

/** Per-task model configuration, overridable with LLM_MODEL_<TASK> / LLM_MAX_TOKENS_<TASK>. */
export function loadTaskConfig(env: NodeJS.ProcessEnv = process.env): Record<LlmTask, LlmTaskConfig> {
  const task = (name: LlmTask, maxTokens: number, effort: LlmTaskConfig['effort']): LlmTaskConfig => {
    const key = name.toUpperCase();
    return {
      model: env[`LLM_MODEL_${key}`] || env.LLM_MODEL_DEFAULT || DEFAULT_MODEL,
      maxTokens: Number(env[`LLM_MAX_TOKENS_${key}`] || maxTokens),
      effort: (env[`LLM_EFFORT_${key}`] as LlmTaskConfig['effort']) || effort,
    };
  };
  return {
    extract: task('extract', 16000, 'medium'),
    translate: task('translate', 8000, 'low'),
    generate: task('generate', 16000, 'high'),
    dedup: task('dedup', 2000, 'low'),
  };
}

export interface UsageHooks {
  /** Called before each model call; throw LlmBudgetExceededError to stop. */
  beforeCall?(task: LlmTask): Promise<void>;
  afterCall?(task: LlmTask, model: string, usage: LlmUsage): Promise<void>;
}

/**
 * Dedicated Bedrock credentials (AWS_BEDROCK_ACCESS_KEY_ID / AWS_BEDROCK_SECRET_ACCESS_KEY)
 * when both are set; otherwise undefined, so the default AWS credential chain applies.
 */
function bedrockCredentials(env: NodeJS.ProcessEnv = process.env) {
  const accessKeyId = env.AWS_BEDROCK_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_BEDROCK_SECRET_ACCESS_KEY;
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
}

/**
 * Claude on Amazon Bedrock. `BEDROCK_TRANSPORT=mantle` (default) uses the Anthropic Bedrock
 * Mantle client; `runtime` uses the standard Bedrock runtime (InvokeModel), for accounts
 * without Mantle access. Credentials come from `bedrockCredentials()`.
 * Structured outputs (`output_config.format`) constrain the response to the zod schema,
 * then the result is re-validated locally. One repair attempt, then LlmOutputError.
 */
export class BedrockClaudeClient implements LlmClient {
  private readonly client: Pick<AnthropicBedrockMantle, 'messages'>;

  constructor(
    private readonly tasks: Record<LlmTask, LlmTaskConfig> = loadTaskConfig(),
    opts: { awsRegion?: string; timeoutMs?: number } = {},
    private readonly hooks: UsageHooks = {},
  ) {
    const creds = bedrockCredentials();
    const common = {
      awsRegion: opts.awsRegion ?? process.env.BEDROCK_REGION ?? process.env.AWS_REGION,
      timeout: opts.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS || 600_000),
      maxRetries: 2,
    };
    if (process.env.BEDROCK_TRANSPORT === 'runtime') {
      const client = creds
        ? new AnthropicBedrock({ ...common, awsAccessKey: creds.accessKeyId, awsSecretKey: creds.secretAccessKey })
        : new AnthropicBedrock(common);
      this.client = client as unknown as Pick<AnthropicBedrockMantle, 'messages'>;
    } else {
      this.client = creds
        ? new AnthropicBedrockMantle({ ...common, awsAccessKey: creds.accessKeyId, awsSecretAccessKey: creds.secretAccessKey })
        : new AnthropicBedrockMantle(common);
    }
  }

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const cfg = this.tasks[req.task];
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: req.user }];
    let lastIssues: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.hooks.beforeCall?.(req.task);
      let response;
      try {
        response = await this.client.messages.parse({
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          system: req.system,
          messages,
          output_config: { format: zodOutputFormat(req.schema as any), effort: cfg.effort },
        });
      } catch (err) {
        throw classifyApiError(err, cfg.model);
      }
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      await this.hooks.afterCall?.(req.task, cfg.model, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      if (response.stop_reason === 'refusal') {
        throw new LlmRefusalError(`Model refused ${req.task} request`, cfg.model);
      }

      const candidate = response.stop_reason === 'max_tokens' ? null : response.parsed_output;
      const checked = req.schema.safeParse(candidate);
      if (checked.success) {
        return { data: checked.data, model: cfg.model, promptVersion: req.promptVersion, usage, attempts: attempt };
      }
      lastIssues = response.stop_reason === 'max_tokens' ? 'output truncated (max_tokens)' : checked.error.issues;

      // Bounded repair: show the model its own output and the validation errors once.
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      messages.push({ role: 'assistant', content: text || '{}' });
      messages.push({
        role: 'user',
        content: `Your previous output did not match the required schema: ${JSON.stringify(lastIssues).slice(0, 2000)}. Return a corrected object. Unknown values must be null.`,
      });
    }
    throw new LlmOutputError(`Invalid ${req.task} output after repair attempt`, lastIssues, cfg.model, 2);
  }
}

const CONVERSE_TOOL = 'emit_result';

/** Some providers return the tool input as a JSON string instead of an object. */
function parseToolInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
const CONVERSE_TRANSIENT = /Throttling|ServiceUnavailable|InternalServer|ModelNotReady|ModelTimeout|Timeout|ECONNRESET|socket hang up/i;

/** JSON Schema for a zod schema, without keys some Bedrock providers reject. */
function toolSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = zToJsonSchema(schema) as Record<string, unknown>;
  return rest;
}

type JsonSchema = {
  type?: string | string[];
  anyOf?: JsonSchema[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

function allows(s: JsonSchema, type: string): boolean {
  if (s.anyOf) return s.anyOf.some((x) => allows(x, type));
  return Array.isArray(s.type) ? s.type.includes(type) : s.type === type;
}

/**
 * Models without constrained decoding drift from the schema in predictable, harmless ways:
 * they omit unknown nullable keys instead of sending null, skip empty lists, pick a label
 * outside an enum that has an "other" bucket, or quote numbers. Fix exactly those, guided
 * by the JSON Schema; anything else is left for zod validation and the repair attempt.
 */
export function conformToSchema(value: unknown, schema: JsonSchema): unknown {
  if (schema.anyOf) {
    if (value === null || value === undefined) return allows(schema, 'null') ? null : value;
    const branch = schema.anyOf.find((b) => !allows(b, 'null')) ?? schema.anyOf[0];
    return conformToSchema(value, branch);
  }
  if (schema.enum && typeof value === 'string' && !schema.enum.includes(value)) {
    const exact = schema.enum.find((e) => typeof e === 'string' && e.toLowerCase() === value.toLowerCase());
    const other = schema.enum.find((e) => typeof e === 'string' && e.toLowerCase() === 'other');
    return exact ?? other ?? value;
  }
  if ((allows(schema, 'number') || allows(schema, 'integer')) && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (allows(schema, 'array') && Array.isArray(value) && schema.items) {
    return value.map((v) => conformToSchema(v, schema.items!));
  }
  if (allows(schema, 'object') && schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (out[key] === undefined && schema.required?.includes(key)) {
        if (allows(sub, 'null')) out[key] = null;
        else if (allows(sub, 'array')) out[key] = [];
        continue;
      }
      if (out[key] !== undefined) out[key] = conformToSchema(out[key], sub);
    }
    return out;
  }
  return value;
}

/**
 * Any Bedrock chat model (Amazon Nova, DeepSeek, Kimi, Qwen, Mistral, GLM, gpt-oss, ...)
 * through the Converse API. Structured output is a forced tool call whose input schema is
 * the zod schema; the input is then re-validated locally. Same bounded repair as Claude.
 * Selected with BEDROCK_TRANSPORT=converse; models via LLM_MODEL_<TASK> / LLM_MODEL_DEFAULT.
 */
export class BedrockConverseClient implements LlmClient {
  private readonly client: BedrockRuntimeClient;
  /** Models that rejected a named toolChoice; they get `any` instead. */
  private readonly anyToolChoice = new Set<string>();

  constructor(
    private readonly tasks: Record<LlmTask, LlmTaskConfig> = loadTaskConfig(),
    opts: { awsRegion?: string; timeoutMs?: number } = {},
    private readonly hooks: UsageHooks = {},
  ) {
    const timeout = opts.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS || 600_000);
    this.client = new BedrockRuntimeClient({
      region: opts.awsRegion ?? process.env.BEDROCK_REGION ?? process.env.AWS_REGION,
      credentials: bedrockCredentials(),
      requestHandler: { requestTimeout: timeout },
    });
  }

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const cfg = this.tasks[req.task];
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    const messages: Message[] = [{ role: 'user', content: [{ text: req.user }] }];
    const jsonSchema = toolSchema(req.schema as z.ZodType<unknown>);
    const tools = [
      { toolSpec: { name: CONVERSE_TOOL, description: `Return the ${req.task} result. Unknown values must be null.`, inputSchema: { json: jsonSchema as any } } },
    ];
    let lastIssues: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.hooks.beforeCall?.(req.task);
      const response = await this.send(cfg, req.system, messages, tools);
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;
      usage.inputTokens += inputTokens;
      usage.outputTokens += outputTokens;
      await this.hooks.afterCall?.(req.task, cfg.model, { inputTokens, outputTokens });

      if (response.stopReason === 'guardrail_intervened' || response.stopReason === 'content_filtered') {
        throw new LlmRefusalError(`Model refused ${req.task} request (${response.stopReason})`, cfg.model);
      }

      const content = response.output?.message?.content ?? [];
      const toolUse = content.find((b) => b.toolUse)?.toolUse;
      const truncated = response.stopReason === 'max_tokens';
      const checked = req.schema.safeParse(truncated ? null : conformToSchema(parseToolInput(toolUse?.input), jsonSchema as JsonSchema));
      if (checked.success) {
        return { data: checked.data, model: cfg.model, promptVersion: req.promptVersion, usage, attempts: attempt };
      }
      lastIssues = truncated ? 'output truncated (max_tokens)' : toolUse ? checked.error.issues : 'no tool call returned';

      // Bounded repair: show the model its own output and the validation errors once.
      const fix = `Your previous output did not match the required schema: ${JSON.stringify(lastIssues).slice(0, 2000)}. Call ${CONVERSE_TOOL} again with a corrected object. Unknown values must be null.`;
      if (toolUse?.toolUseId) {
        messages.push({ role: 'assistant', content: [{ toolUse }] });
        messages.push({ role: 'user', content: [{ toolResult: { toolUseId: toolUse.toolUseId, status: 'error', content: [{ text: fix }] } }] });
      } else {
        const text = content.map((b) => b.text ?? '').join('');
        messages.push({ role: 'assistant', content: [{ text: text || '{}' }] });
        messages.push({ role: 'user', content: [{ text: fix }] });
      }
    }
    throw new LlmOutputError(`Invalid ${req.task} output after repair attempt`, lastIssues, cfg.model, 2);
  }

  private async send(cfg: LlmTaskConfig, system: string, messages: Message[], tools: Tool[]): Promise<ConverseCommandOutput> {
    const named = !this.anyToolChoice.has(cfg.model);
    const command = (toolChoice: ToolChoice) =>
      new ConverseCommand({
        modelId: cfg.model,
        system: [{ text: system }],
        messages,
        toolConfig: { tools, toolChoice },
        inferenceConfig: { maxTokens: cfg.maxTokens },
      });
    try {
      return await this.client.send(command(named ? { tool: { name: CONVERSE_TOOL } } : { any: {} }));
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (named && e.name === 'ValidationException' && /tool.?choice/i.test(e.message ?? '')) {
        this.anyToolChoice.add(cfg.model);
        return this.send(cfg, system, messages, tools);
      }
      if (CONVERSE_TRANSIENT.test(e.name ?? '') || CONVERSE_TRANSIENT.test(e.message ?? '')) {
        throw new LlmTransientError(`Bedrock transient error for ${cfg.model}: ${e.name}: ${e.message}`, err);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

/** Picks the client for BEDROCK_TRANSPORT: `converse` (any model) or Claude (`mantle` / `runtime`). */
export function createLlmClient(
  tasks: Record<LlmTask, LlmTaskConfig> = loadTaskConfig(),
  opts: { awsRegion?: string; timeoutMs?: number } = {},
  hooks: UsageHooks = {},
): LlmClient {
  return process.env.BEDROCK_TRANSPORT === 'converse' ? new BedrockConverseClient(tasks, opts, hooks) : new BedrockClaudeClient(tasks, opts, hooks);
}

function classifyApiError(err: unknown, model: string): Error {
  if (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError
  ) {
    return new LlmTransientError(`Bedrock transient error for ${model}: ${(err as Error).message}`, err);
  }
  if (err instanceof Anthropic.APIError && (err.status === 408 || err.status === 409 || err.status === 529)) {
    return new LlmTransientError(`Bedrock transient error ${err.status} for ${model}`, err);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Titan v2 text embeddings (1024 dims, matching the vector(1024) columns). */
export class TitanEmbeddingClient implements EmbeddingClient {
  private readonly client: BedrockRuntimeClient;
  readonly model: string;

  constructor(opts: { region?: string; model?: string } = {}) {
    this.model = opts.model ?? process.env.EMBEDDING_MODEL ?? 'amazon.titan-embed-text-v2:0';
    this.client = new BedrockRuntimeClient({
      region: opts.region ?? process.env.BEDROCK_REGION ?? process.env.AWS_REGION,
      credentials: bedrockCredentials(),
    });
  }

  async embed(text: string): Promise<number[]> {
    try {
      const res = await this.client.send(
        new InvokeModelCommand({
          modelId: this.model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({ inputText: text.slice(0, 20_000), dimensions: 1024, normalize: true }),
        }),
      );
      const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embedding: number[] };
      return parsed.embedding;
    } catch (err) {
      const name = (err as { name?: string }).name ?? '';
      if (/Throttling|ServiceUnavailable|InternalServer|Timeout/i.test(name)) {
        throw new LlmTransientError(`Embedding transient error: ${name}`, err);
      }
      throw err;
    }
  }
}
