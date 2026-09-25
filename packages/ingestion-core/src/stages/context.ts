import type { PrismaClient } from '@lazyfounders/database';
import type { EmbeddingClient, LlmClient } from '@lazyfounders/llm';
import type { AlertNotifier, PipelineMetrics } from '../infra/observability';
import type { RobotsService } from '../infra/robots-service';
import type { SnapshotStorage } from '../infra/snapshots';
import type { RateLimiter } from '../net/rate-limit';
import { SafeFetcher, type Resolver, type Transport } from '../net/safe-fetch';
import { DomainAllowlist } from '../registry/allowlist';

/** Renders a page in a headless browser. Only used for sources with renderPolicy fallback/required. */
export interface HeadlessRenderer {
  render(url: string, opts: { assertAllowed: (url: string) => Promise<void>; timeoutMs: number }): Promise<string>;
}

export interface PipelineConfig {
  publishLanguage: string;
  brand: string;
  siteUrl: string;
  autoPublishEnabled: boolean;
  dedupWindowDays: number;
  /** Author slug credited on new articles. */
  defaultAuthorSlug: string;
}

export function loadPipelineConfig(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  return {
    publishLanguage: env.PUBLISH_LANGUAGE || 'en',
    brand: env.SITE_BRAND_NAME || 'LazyFounders',
    siteUrl: (env.NEXT_PUBLIC_SITE_URL || 'https://lazyfounders.com').replace(/\/$/, ''),
    autoPublishEnabled: env.AUTO_PUBLISH_ENABLED === 'true',
    dedupWindowDays: Number(env.DEDUP_WINDOW_DAYS || 7),
    defaultAuthorSlug: env.DEFAULT_AUTHOR_SLUG || 'tarun-mottlia',
  };
}

export interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

export interface PipelineDeps {
  prisma: PrismaClient;
  allowlist: DomainAllowlist;
  robots: RobotsService;
  rateLimiter: RateLimiter;
  snapshots: SnapshotStorage;
  llm: LlmClient;
  embeddings: EmbeddingClient;
  config: PipelineConfig;
  logger: Logger;
  metrics?: PipelineMetrics;
  alerts?: AlertNotifier;
  renderer?: HeadlessRenderer;
  /** Test seams for the network layer. */
  resolver?: Resolver;
  transport?: Transport;
}

/** A SafeFetcher that may only reach the approved domains of one source. */
export function fetcherForSource(deps: PipelineDeps, sourceId: string, opts: { maxBytes?: number; includeUnapproved?: boolean } = {}): SafeFetcher {
  return new SafeFetcher({
    hostPolicy: deps.allowlist.forSource(sourceId, { includeUnapproved: opts.includeUnapproved }),
    resolver: deps.resolver,
    transport: deps.transport,
    maxBytes: opts.maxBytes,
  });
}
