import { createHash } from 'node:crypto';

/** Logical pipeline stages. Each has its own BullMQ queue and can be scaled independently. */
export const STAGES = {
  DISCOVER: 'discover.source',
  SCRAPE: 'article.scrape',
  NORMALIZE: 'article.normalize',
  TRANSLATE: 'article.translate',
  EXTRACT: 'article.extract',
  DEDUPE: 'story.dedupe',
  GENERATE: 'article.generate',
  VALIDATE: 'article.validate',
  PUBLISH: 'article.publish',
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];
export const ALL_STAGES: Stage[] = Object.values(STAGES);

export interface StageDefaults {
  maxAttempts: number;
  timeoutMs: number;
  concurrency: number;
}

const DEFAULTS: Record<Stage, StageDefaults> = {
  'discover.source': { maxAttempts: 3, timeoutMs: 10 * 60_000, concurrency: 2 },
  'article.scrape': { maxAttempts: 4, timeoutMs: 90_000, concurrency: 4 },
  'article.normalize': { maxAttempts: 3, timeoutMs: 60_000, concurrency: 4 },
  'article.translate': { maxAttempts: 4, timeoutMs: 5 * 60_000, concurrency: 2 },
  'article.extract': { maxAttempts: 4, timeoutMs: 5 * 60_000, concurrency: 2 },
  'story.dedupe': { maxAttempts: 4, timeoutMs: 2 * 60_000, concurrency: 2 },
  'article.generate': { maxAttempts: 4, timeoutMs: 10 * 60_000, concurrency: 2 },
  'article.validate': { maxAttempts: 3, timeoutMs: 60_000, concurrency: 4 },
  'article.publish': { maxAttempts: 5, timeoutMs: 60_000, concurrency: 2 },
};

const envKey = (stage: Stage) => stage.replace('.', '_').toUpperCase();

/** Stage settings with env overrides: WORKER_CONCURRENCY_<STAGE>, JOB_MAX_ATTEMPTS_<STAGE>, JOB_TIMEOUT_MS_<STAGE>. */
export function stageSettings(stage: Stage, env: NodeJS.ProcessEnv = process.env): StageDefaults {
  const d = DEFAULTS[stage];
  const k = envKey(stage);
  return {
    maxAttempts: Number(env[`JOB_MAX_ATTEMPTS_${k}`] || d.maxAttempts),
    timeoutMs: Number(env[`JOB_TIMEOUT_MS_${k}`] || d.timeoutMs),
    concurrency: Number(env[`WORKER_CONCURRENCY_${k}`] || d.concurrency),
  };
}

export function queueName(stage: Stage): string {
  return `v2-${stage.replace('.', '-')}`;
}

/** Parse WORKER_STAGES="article.scrape,article.normalize" (or "all"). */
export function parseStages(value: string | undefined, fallback: Stage[]): Stage[] {
  if (!value) return fallback;
  if (value.trim() === 'all') return ALL_STAGES;
  const wanted = value.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = wanted.filter((s) => !ALL_STAGES.includes(s as Stage));
  if (unknown.length) throw new Error(`Unknown stages in WORKER_STAGES: ${unknown.join(', ')}`);
  return wanted as Stage[];
}

/** BullMQ custom ids cannot contain ":"; derive a stable id from the idempotency key. */
export function bullJobId(idempotencyKey: string, replayCount = 0): string {
  const id = createHash('sha1').update(idempotencyKey).digest('hex');
  return replayCount > 0 ? `${id}-r${replayCount}` : id;
}
