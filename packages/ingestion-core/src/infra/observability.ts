import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { SerializedError } from '../errors';
import type { JobOutcome } from '../jobs/execute';
import type { JobRecord } from '../jobs/job-store';
import type { Stage } from '../jobs/stages';

export interface PipelineMetrics {
  registry: Registry;
  jobs: Counter<'stage' | 'outcome'>;
  jobDuration: Histogram<'stage'>;
  sourceScans: Counter<'source' | 'result'>;
  deadLetters: Gauge<'stage'>;
  llmTokens: Counter<'task' | 'model' | 'direction'>;
  llmValidationFailures: Counter<'task'>;
  articles: Counter<'event'>;
}

let shared: PipelineMetrics | null = null;

/** One Prometheus registry per process, exposed by each service at /metrics. */
export function pipelineMetrics(service: string): PipelineMetrics {
  if (shared) return shared;
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });
  shared = {
    registry,
    jobs: new Counter({ name: 'pipeline_jobs_total', help: 'Stage job deliveries by outcome', labelNames: ['stage', 'outcome'], registers: [registry] }),
    jobDuration: new Histogram({
      name: 'pipeline_job_duration_seconds',
      help: 'Stage job duration',
      labelNames: ['stage'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
      registers: [registry],
    }),
    sourceScans: new Counter({ name: 'source_scans_total', help: 'Source scans by result', labelNames: ['source', 'result'], registers: [registry] }),
    deadLetters: new Gauge({ name: 'pipeline_dead_letters', help: 'Dead-lettered jobs currently stored', labelNames: ['stage'], registers: [registry] }),
    llmTokens: new Counter({ name: 'llm_tokens_total', help: 'LLM tokens', labelNames: ['task', 'model', 'direction'], registers: [registry] }),
    llmValidationFailures: new Counter({ name: 'llm_validation_failures_total', help: 'LLM outputs rejected by schema/grounding', labelNames: ['task'], registers: [registry] }),
    articles: new Counter({ name: 'pipeline_articles_total', help: 'Article lifecycle events', labelNames: ['event'], registers: [registry] }),
  };
  return shared;
}

export function recordOutcome(m: PipelineMetrics, stage: Stage, outcome: JobOutcome, durationMs: number): void {
  m.jobs.inc({ stage, outcome: outcome.kind === 'skipped' ? `skipped_${outcome.reason}` : outcome.kind });
  m.jobDuration.observe({ stage }, durationMs / 1000);
}

/**
 * Failure alerts to a Slack-compatible webhook (ALERT_WEBHOOK_URL). Throttled per key so
 * a failing source or stage produces one alert per window, not one per job.
 * Messages contain ids and error codes only, never article content or secrets.
 */
export class AlertNotifier {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly webhookUrl = process.env.ALERT_WEBHOOK_URL,
    private readonly windowMs = Number(process.env.ALERT_THROTTLE_MS || 15 * 60_000),
    private readonly log: (msg: string, meta?: Record<string, unknown>) => void = () => undefined,
  ) {}

  async notify(key: string, text: string): Promise<void> {
    const now = Date.now();
    if ((this.last.get(key) ?? 0) + this.windowMs > now) return;
    this.last.set(key, now);
    this.log(`ALERT ${text}`, { key });
    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.log('alert webhook failed', { error: (err as Error).message });
    }
  }

  deadLetter(job: JobRecord, error: SerializedError): Promise<void> {
    return this.notify(
      `dlq:${job.stage}:${error.code}`,
      `:rotating_light: Dead-lettered ${job.stage} job ${job.id} (correlation ${job.correlationId}) after ${job.attempts} attempt(s): ${error.code} - ${error.message.slice(0, 200)}`,
    );
  }

  sourceFailing(sourceName: string, failures: number, error: string | null): Promise<void> {
    return this.notify(`source:${sourceName}`, `:warning: Source ${sourceName} failed ${failures} consecutive scans: ${error?.slice(0, 200) ?? 'unknown error'}`);
  }
}
