import type { EmbeddingClient, LlmClient, LlmTask, StructuredRequest, StructuredResult } from './client';
import { LlmOutputError } from './client';

export type FakeResponder = (req: StructuredRequest<unknown>, attempt: number) => unknown | Promise<unknown>;

/**
 * Deterministic LLM for tests and local dry runs. Responses go through the same
 * validate -> one repair attempt -> LlmOutputError path as the real client, so tests
 * exercise the real failure semantics.
 */
export class FakeLlmClient implements LlmClient {
  readonly calls: Array<{ task: LlmTask; promptVersion: string; user: string }> = [];

  constructor(private readonly responders: Partial<Record<LlmTask, FakeResponder>>, readonly model = 'fake-model') {}

  async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const responder = this.responders[req.task];
    if (!responder) throw new Error(`FakeLlmClient has no responder for task "${req.task}"`);
    let issues: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.calls.push({ task: req.task, promptVersion: req.promptVersion, user: req.user });
      const raw = await responder(req as StructuredRequest<unknown>, attempt);
      const checked = req.schema.safeParse(raw);
      if (checked.success) {
        return {
          data: checked.data,
          model: this.model,
          promptVersion: req.promptVersion,
          usage: { inputTokens: 0, outputTokens: 0 },
          attempts: attempt,
        };
      }
      issues = checked.error.issues;
    }
    throw new LlmOutputError(`Invalid ${req.task} output after repair attempt`, issues, this.model, 2);
  }
}

/** Bag-of-words hashing embedding: similar texts get similar vectors. Tests only. */
export class FakeEmbeddingClient implements EmbeddingClient {
  readonly model = 'fake-embedding';
  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(1024).fill(0);
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
      let h = 2166136261;
      for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
      v[Math.abs(h) % 1024] += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
