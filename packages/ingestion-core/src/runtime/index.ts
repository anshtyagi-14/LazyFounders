import type { PrismaClient } from '@lazyfounders/database';
import { LlmBudgetExceededError, createLlmClient, TitanEmbeddingClient, loadTaskConfig, type EmbeddingClient, type LlmClient } from '@lazyfounders/llm';
import type { Worker } from 'bullmq';
import Redis from 'ioredis';
import { DeferredError } from '../errors';
import { AlertNotifier, pipelineMetrics, recordOutcome, type PipelineMetrics } from '../infra/observability';
import { RobotsService } from '../infra/robots-service';
import { createSnapshotStorage } from '../infra/snapshots';
import type { StageHandler } from '../jobs/execute';
import { PrismaJobStore } from '../jobs/job-store';
import { OutboxDispatcher, PrismaOutboxStore } from '../jobs/outbox';
import { ALL_STAGES, parseStages, type Stage } from '../jobs/stages';
import { BullTransport, startStageWorker } from '../jobs/transport';
import { RedisLock } from '../net/lock';
import { RedisRateLimiter } from '../net/rate-limit';
import { DomainAllowlist } from '../registry/allowlist';
import { createStageHandlers, loadPipelineConfig, type HeadlessRenderer, type Logger, type PipelineDeps } from '../stages';
import { DiscoveryScheduler } from './scheduler';

export { DiscoveryScheduler } from './scheduler';

export interface RuntimeOptions {
  service: string;
  /** Stages this service runs when WORKER_STAGES is not set. */
  defaultStages: Stage[];
  prisma: PrismaClient;
  logger: Logger;
  renderer?: HeadlessRenderer;
  /** Run the discovery scheduler in this process (discovery-service). */
  scheduler?: boolean;
  /** Overrides for tests / local dry runs. */
  llm?: LlmClient;
  embeddings?: EmbeddingClient;
}

export interface PipelineRuntime {
  stages: Stage[];
  metrics: PipelineMetrics;
  scheduler: DiscoveryScheduler | null;
  transport: BullTransport;
  close(): Promise<void>;
}

export function isPipelineV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PIPELINE_V2_ENABLED === 'true';
}

export function isLegacyPipelineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEGACY_PIPELINE_ENABLED !== 'false';
}

/** BullMQ/ioredis connection settings from REDIS_URL or REDIS_HOST/PORT/PASSWORD/DB. */
export function redisOptions(env: NodeJS.ProcessEnv = process.env) {
  if (env.REDIS_URL) {
    const u = new URL(env.REDIS_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password ? decodeURIComponent(u.password) : env.REDIS_PASSWORD || undefined,
      username: u.username || undefined,
      db: Number(u.pathname.replace('/', '') || env.REDIS_DB || 0),
      tls: u.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }
  return {
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT || 6379),
    password: env.REDIS_PASSWORD || undefined,
    db: Number(env.REDIS_DB || 0),
    maxRetriesPerRequest: null,
  };
}

function msUntilUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime() + 60_000;
}

/** Daily LLM token budget shared by all replicas (0 = unlimited). */
function budgetHooks(redis: Redis, metrics: PipelineMetrics) {
  const budget = Number(process.env.LLM_DAILY_TOKEN_BUDGET || 0);
  const key = () => `lf:v2:llm:tokens:${new Date().toISOString().slice(0, 10)}`;
  return {
    async beforeCall() {
      if (!budget) return;
      const used = Number((await redis.get(key())) || 0);
      if (used >= budget) throw new LlmBudgetExceededError(`LLM daily token budget reached (${used}/${budget})`);
    },
    async afterCall(task: string, model: string, usage: { inputTokens: number; outputTokens: number }) {
      metrics.llmTokens.inc({ task, model, direction: 'input' }, usage.inputTokens);
      metrics.llmTokens.inc({ task, model, direction: 'output' }, usage.outputTokens);
      if (!budget) return;
      const k = key();
      await redis.multi().incrby(k, usage.inputTokens + usage.outputTokens).expire(k, 3 * 86400).exec();
    },
  };
}

/** Budget exhaustion defers work until the budget resets instead of burning retry attempts. */
function withBudgetDeferral(handler: StageHandler<any>): StageHandler<any> {
  return async (env, ctx) => {
    try {
      await handler(env, ctx);
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) throw new DeferredError(err.message, msUntilUtcMidnight());
      throw err;
    }
  };
}

/**
 * Start the v2 pipeline inside a service: stage workers (WORKER_STAGES), the outbox
 * dispatcher, optionally the discovery scheduler, metrics and alerts. Every service can
 * run any stage; deployments choose stages and scale with replicas/concurrency.
 */
export async function startPipelineRuntime(o: RuntimeOptions): Promise<PipelineRuntime> {
  const connection = redisOptions();
  const redis = new Redis(connection);
  const metrics = pipelineMetrics(o.service);
  const alerts = new AlertNotifier(undefined, undefined, (msg, meta) => o.logger.warn({ ...meta }, msg));
  const jobs = new PrismaJobStore(o.prisma);
  const transport = new BullTransport(connection);

  const deps: PipelineDeps = {
    prisma: o.prisma,
    allowlist: DomainAllowlist.fromPrisma(o.prisma),
    robots: new RobotsService(),
    rateLimiter: new RedisRateLimiter(redis),
    snapshots: createSnapshotStorage(),
    llm: o.llm ?? createLlmClient(loadTaskConfig(), {}, budgetHooks(redis, metrics)),
    embeddings: o.embeddings ?? new TitanEmbeddingClient(),
    config: loadPipelineConfig(),
    logger: o.logger,
    metrics,
    alerts,
    renderer: o.renderer,
  };
  const handlers = createStageHandlers(deps, new RedisLock(redis));
  const stages = parseStages(process.env.WORKER_STAGES, o.defaultStages).filter((s) => ALL_STAGES.includes(s));

  const workers: Worker[] = stages.map((stage) =>
    startStageWorker({
      stage,
      handler: withBudgetDeferral(handlers[stage]),
      connection,
      store: jobs,
      onDeadLetter: (job, error) => alerts.deadLetter(job, error),
      onOutcome: (s, outcome, ms) => {
        recordOutcome(metrics, s, outcome, ms);
        if (outcome.kind !== 'succeeded' && outcome.kind !== 'skipped') {
          o.logger.warn({ stage: s, outcome: outcome.kind, code: outcome.error.code, message: outcome.error.message }, 'stage job not completed');
        }
      },
    }),
  );
  for (const w of workers) w.on('error', (err) => o.logger.error({ err: err.message }, 'stage worker error'));

  const dispatcher = new OutboxDispatcher(new PrismaOutboxStore(o.prisma), jobs, transport, {
    onError: (err) => o.logger.error({ err: (err as Error).message }, 'outbox dispatch failed'),
  });
  dispatcher.start();

  const scheduler =
    o.scheduler && process.env.PIPELINE_SCHEDULER_ENABLED !== 'false'
      ? new DiscoveryScheduler(o.prisma, { onError: (err) => o.logger.error({ err: (err as Error).message }, 'scheduler tick failed') })
      : null;
  scheduler?.start();

  // Dead-letter gauge for dashboards/alerts.
  const dlqTimer = setInterval(async () => {
    try {
      const rows = await o.prisma.pipelineJob.groupBy({ by: ['stage'], where: { status: 'DEAD_LETTER' }, _count: { _all: true } });
      metrics.deadLetters.reset();
      for (const r of rows) metrics.deadLetters.set({ stage: r.stage }, r._count._all);
      const total = rows.reduce((n, r) => n + r._count._all, 0);
      const threshold = Number(process.env.ALERT_DLQ_THRESHOLD || 25);
      if (total >= threshold) await alerts.notify('dlq:threshold', `:rotating_light: ${total} dead-lettered pipeline jobs (threshold ${threshold})`);
    } catch (err) {
      o.logger.warn({ err: (err as Error).message }, 'dlq gauge refresh failed');
    }
  }, 60_000);

  o.logger.info({ service: o.service, stages, scheduler: Boolean(scheduler) }, 'pipeline v2 runtime started');

  return {
    stages,
    metrics,
    scheduler,
    transport,
    async close() {
      clearInterval(dlqTimer);
      scheduler?.stop();
      dispatcher.stop();
      await Promise.all(workers.map((w) => w.close()));
      await transport.close();
      redis.disconnect();
    },
  };
}
