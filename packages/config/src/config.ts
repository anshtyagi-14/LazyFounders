import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { rootConfigSchema, AppConfig } from './schemas';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Singleton cache for the loaded configuration
let cachedConfig: AppConfig | null = null;

/**
 * Extracts configuration values from process.env and maps them to the structured config object.
 */
function mapEnvToConfig(): Record<string, unknown> {
  const env = process.env;

  return {
    app: {
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      port: env.PORT,
    },
    database: {
      url: env.DATABASE_URL,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
    },
    queue: {
      adapter: env.QUEUE_ADAPTER,
      bullmq: {
        prefix: env.BULLMQ_PREFIX,
      },
      sqs: {
        region: env.AWS_REGION,
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        discoveryQueueUrl: env.SQS_DISCOVERY_QUEUE_URL,
        scraperQueueUrl: env.SQS_SCRAPER_QUEUE_URL,
      },
    },
    fetcher: {
      timeoutMs: env.FETCH_TIMEOUT_MS,
      maxRetries: env.FETCH_MAX_RETRIES,
      retryDelayMs: env.FETCH_RETRY_DELAY_MS,
      defaultRateLimitRpm: env.DEFAULT_RATE_LIMIT_RPM,
      maxConcurrentPerDomain: env.MAX_CONCURRENT_FETCHES_PER_DOMAIN,
    },
    proxy: {
      enabled: env.PROXY_ENABLED,
      host: env.PROXY_HOST,
      port: env.PROXY_PORT,
      username: env.PROXY_USERNAME,
      password: env.PROXY_PASSWORD,
      provider: env.PROXY_PROVIDER,
    },
    playwright: {
      headless: env.PLAYWRIGHT_HEADLESS,
      browserPoolSize: env.BROWSER_POOL_SIZE,
      recycleAfter: env.BROWSER_RECYCLE_AFTER,
    },
    discovery: {
      defaultRecencyWindowHours: env.DEFAULT_RECENCY_WINDOW_HOURS,
      bloomFilterExpectedItems: env.BLOOM_FILTER_EXPECTED_ITEMS,
      bloomFilterFalsePositiveRate: env.BLOOM_FILTER_FALSE_POSITIVE_RATE,
    },
    metrics: {
      enabled: env.METRICS_ENABLED,
      port: env.METRICS_PORT,
    },
  };
}

/**
 * Loads and validates the application configuration from environment variables.
 * Caches the result to ensure validation is only run once per application lifecycle.
 * 
 * @returns The strongly-typed application configuration.
 * @throws ConfigError If configuration validation fails.
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load environment variables from .env file in the current working directory
  dotenvConfig({ path: resolve(process.cwd(), '.env') });

  const rawConfig = mapEnvToConfig();
  const result = rootConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errorMessages = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n');
    
    throw new ConfigError(`Configuration validation failed:\n${errorMessages}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Retrieves the loaded configuration. 
 * Throws an error if loadConfig() has not been called yet.
 * 
 * @returns The strongly-typed application configuration.
 * @throws ConfigError If the configuration has not been loaded.
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    throw new ConfigError('Configuration has not been loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}
