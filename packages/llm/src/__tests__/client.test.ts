import { describe, expect, it } from 'vitest';
import { FakeLlmClient, LlmOutputError, loadTaskConfig } from '../index';
import { ExtractionSchema, GeneratedArticleSchema } from '../schemas';

describe('llm package', () => {
  it('model ids are configurable per task and default to Claude on Bedrock', () => {
    const cfg = loadTaskConfig({ LLM_MODEL_TRANSLATE: 'custom-translate-model', LLM_EFFORT_GENERATE: 'medium' } as NodeJS.ProcessEnv);
    expect(cfg.extract.model).toBe('anthropic.claude-opus-5');
    expect(cfg.translate.model).toBe('custom-translate-model');
    expect(cfg.generate.effort).toBe('medium');
  });

  it('rejects output that does not match the schema after one repair attempt', async () => {
    const llm = new FakeLlmClient({ extract: () => ({ nope: true }) });
    await expect(llm.structured({ task: 'extract', promptVersion: 'extract.v1', system: '', user: '', schema: ExtractionSchema })).rejects.toBeInstanceOf(LlmOutputError);
    expect(llm.calls).toHaveLength(2);
  });

  it('generation schema requires every template field', () => {
    expect(GeneratedArticleSchema.safeParse({ headline: 'x' }).success).toBe(false);
  });
});
