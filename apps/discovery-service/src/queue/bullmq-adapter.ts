import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { QueueJob } from '@lazyfounders/shared';
import type { IQueueAdapter, EnqueueOptions, EnqueueResult } from './types.js';

/**
 * BullMQ adapter implementation for the Queue Abstraction layer.
 * Manages job queueing using Redis-backed BullMQ.
 */
export class BullMQAdapter implements IQueueAdapter {
  private readonly queues: Map<string, Queue> = new Map();
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly logger: Logger;

  /**
   * Initializes a new BullMQAdapter.
   *
   * @param redis - Redis connection instance.
   * @param prefix - Prefix to use for BullMQ keys in Redis.
   * @param logger - Logger instance.
   */
  constructor(redis: Redis, prefix: string, logger: Logger) {
    this.redis = redis;
    this.prefix = prefix;
    this.logger = logger;
  }

  /**
   * Gets an existing queue or creates a new one lazily.
   *
   * @param queueName - Name of the queue.
   * @returns BullMQ Queue instance.
   */
  private getOrCreateQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, {
        connection: this.redis,
        prefix: this.prefix,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });
      this.queues.set(queueName, queue);
      this.logger.debug({ queueName }, 'Created BullMQ queue instance');
    }
    return queue;
  }

  /**
   * Enqueues a single job to the specified queue.
   *
   * @param queueName - Target queue name.
   * @param job - Job payload.
   * @param options - Enqueue options.
   * @returns Resolves with EnqueueResult containing the jobId.
   */
  public async enqueue(queueName: string, job: QueueJob, options?: EnqueueOptions): Promise<EnqueueResult> {
    const queue = this.getOrCreateQueue(queueName);

    const jobOptions = this.mapEnqueueOptionsToBullMQ(options);

    const addedJob = await queue.add(queueName, job, jobOptions);

    this.logger.debug({ queueName, jobId: addedJob.id }, 'Enqueued job to BullMQ');

    return {
      jobId: addedJob.id!,
      queue: queueName,
      timestamp: new Date(addedJob.timestamp).toISOString(),
    };
  }

  /**
   * Enqueues a batch of jobs to the specified queue.
   *
   * @param queueName - Target queue name.
   * @param jobs - Array of job payloads.
   * @param options - Default enqueue options for all jobs in the batch.
   * @returns Resolves with an array of EnqueueResults.
   */
  public async enqueueBatch(queueName: string, jobs: QueueJob[], options?: EnqueueOptions): Promise<EnqueueResult[]> {
    if (jobs.length === 0) {
      return [];
    }

    const queue = this.getOrCreateQueue(queueName);
    const jobOptions = this.mapEnqueueOptionsToBullMQ(options);

    const bulkJobs = jobs.map((job) => ({
      name: queueName,
      data: job,
      opts: jobOptions,
    }));

    const addedJobs = await queue.addBulk(bulkJobs);

    this.logger.debug({ queueName, count: addedJobs.length }, 'Enqueued batch to BullMQ');

    return addedJobs.map((addedJob) => ({
      jobId: addedJob.id!,
      queue: queueName,
      timestamp: new Date(addedJob.timestamp).toISOString(),
    }));
  }

  /**
   * Gets the approximate number of waiting, active, and delayed jobs in the queue.
   *
   * @param queueName - Target queue name.
   * @returns Resolves with the total count.
   */
  public async getQueueSize(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'prioritized');
    const total = counts.wait + counts.active + counts.delayed + counts.prioritized;
    return total;
  }

  /**
   * Drains (removes all delayed and waiting jobs) the queue.
   *
   * @param queueName - Target queue name.
   */
  public async drain(queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.drain();
    this.logger.info({ queueName }, 'Drained BullMQ queue');
  }

  /**
   * Closes all created queue instances.
   */
  public async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map((queue) => queue.close());
    await Promise.all(closePromises);
    this.queues.clear();
    this.logger.info('Closed all BullMQ queues');
  }

  /**
   * Maps abstract EnqueueOptions to BullMQ JobOptions.
   *
   * @param options - Abstract enqueue options.
   * @returns BullMQ specific options.
   */
  private mapEnqueueOptionsToBullMQ(options?: EnqueueOptions): any {
    const opts: any = {};
    if (!options) return opts;

    if (options.priority !== undefined) {
      opts.priority = options.priority;
    }
    if (options.delay !== undefined) {
      opts.delay = options.delay;
    }
    if (options.attempts !== undefined) {
      opts.attempts = options.attempts;
    }
    if (options.backoff) {
      opts.backoff = options.backoff;
    }
    if (options.deduplicationId) {
      opts.jobId = options.deduplicationId; // BullMQ uses jobId for deduplication
    }
    if (options.ttl !== undefined) {
      opts.removeOnComplete = {
        age: Math.max(1, Math.floor(options.ttl / 1000)), // seconds
      };
    }

    return opts;
  }
}
