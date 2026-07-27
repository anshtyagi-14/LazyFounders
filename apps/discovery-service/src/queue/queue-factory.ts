import type { AppConfig } from '@lazyfounders/config';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { IQueueAdapter } from './types.js';
import { BullMQAdapter } from './bullmq-adapter.js';
import { SQSAdapter } from './sqs-adapter.js';

/**
 * Creates and returns the appropriate queue adapter based on the application configuration.
 *
 * @param config - The application configuration object.
 * @param redis - Redis connection instance (used if adapter is bullmq).
 * @param logger - Logger instance.
 * @returns Configured IQueueAdapter instance.
 * @throws Error if an unknown adapter type is specified in the config.
 */
export function createQueueAdapter(
  config: AppConfig,
  redis: Redis,
  logger: Logger
): IQueueAdapter {
  const adapterType = config.queue.adapter;
  
  switch (adapterType) {
    case 'bullmq':
      return new BullMQAdapter(
        redis,
        config.queue.bullmq.prefix,
        logger.child({ component: 'bullmq-adapter' })
      );
    case 'sqs':
      return new SQSAdapter(
        {
          region: config.queue.sqs.region,
          accessKeyId: config.queue.sqs.accessKeyId,
          secretAccessKey: config.queue.sqs.secretAccessKey,
          queueUrls: {
            'discovery-new-urls': config.queue.sqs.discoveryQueueUrl || '',
            'scraper-jobs': config.queue.sqs.scraperQueueUrl || '',
          },
        },
        logger.child({ component: 'sqs-adapter' })
      );
    default:
      throw new Error(`Unknown queue adapter: ${adapterType}`);
  }
}
