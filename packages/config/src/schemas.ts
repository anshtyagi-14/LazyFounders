import { z } from 'zod';

export const appConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),
  port: z.coerce.number().int().positive().default(3001),
});

export const databaseConfigSchema = z.object({
  url: z.string().url(),
});

export const redisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().positive().default(6379),
  password: z.string().optional(),
  db: z.coerce.number().int().min(0).default(0),
});

export const bullmqConfigSchema = z.object({
  prefix: z.string().default('lf'),
});

export const queueConfigSchema = z.object({
  adapter: z.enum(['bullmq', 'sqs']).default('bullmq'),
  bullmq: bullmqConfigSchema,
  sqs: z.object({
    region: z.string().default('us-east-1'),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    discoveryQueueUrl: z.string().url().optional(),
    scraperQueueUrl: z.string().url().optional(),
  }),
});

export const fetcherConfigSchema = z.object({
  timeoutMs: z.coerce.number().int().positive().default(30000),
  maxRetries: z.coerce.number().int().min(0).default(3),
  retryDelayMs: z.coerce.number().int().positive().default(1000),
  defaultRateLimitRpm: z.coerce.number().int().positive().default(30),
  maxConcurrentPerDomain: z.coerce.number().int().positive().default(5),
});

export const proxyConfigSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  host: z.string().optional(),
  port: z.coerce.number().int().positive().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  provider: z.enum(['brightdata', 'smartproxy', 'oxylabs', 'custom']).default('brightdata'),
});

export const playwrightConfigSchema = z.object({
  headless: z.coerce.boolean().default(true),
  browserPoolSize: z.coerce.number().int().positive().default(5),
  recycleAfter: z.coerce.number().int().positive().default(50),
});

export const discoveryConfigSchema = z.object({
  defaultRecencyWindowHours: z.coerce.number().int().positive().default(72),
  bloomFilterExpectedItems: z.coerce.number().int().positive().default(500000),
  bloomFilterFalsePositiveRate: z.coerce.number().positive().max(1).default(0.001),
});

export const metricsConfigSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  port: z.coerce.number().int().positive().default(9090),
});

export const rootConfigSchema = z.object({
  app: appConfigSchema,
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  queue: queueConfigSchema,
  fetcher: fetcherConfigSchema,
  proxy: proxyConfigSchema,
  playwright: playwrightConfigSchema,
  discovery: discoveryConfigSchema,
  metrics: metricsConfigSchema,
});

export type AppConfig = z.infer<typeof rootConfigSchema>;
export type AppConfigOptions = z.input<typeof rootConfigSchema>;
