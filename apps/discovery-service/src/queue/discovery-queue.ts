import type { Logger } from 'pino';
import { QueueJob, ChangeType, QueueNames } from '@lazyfounders/shared';
import type { IQueueAdapter, EnqueueResult } from './types.js';

/**
 * High-level queue wrapper for discovering and emitting new URL jobs.
 */
export class DiscoveryQueue {
  private readonly adapter: IQueueAdapter;
  private readonly logger: Logger;
  private readonly queueName = QueueNames.DISCOVERY_NEW_URLS;

  /**
   * Initializes a new DiscoveryQueue.
   *
   * @param adapter - The underlying queue adapter to use.
   * @param logger - Logger instance.
   */
  constructor(adapter: IQueueAdapter, logger: Logger) {
    this.adapter = adapter;
    this.logger = logger.child({ queue: this.queueName, component: 'DiscoveryQueue' });
  }

  /**
   * Enqueues a single discovered URL job.
   * Throws an error if required fields are missing.
   *
   * @param job - The URL job to enqueue.
   * @returns Resolves with EnqueueResult.
   */
  public async emitNewUrl(job: QueueJob): Promise<EnqueueResult> {
    this.validateJob(job);

    let priority = 5;
    if (job.changeType === ChangeType.NEW) {
      priority = 3;
    } else if (job.changeType === ChangeType.UPDATED) {
      priority = 5;
    } else if (job.changeType === ChangeType.RENAMED) {
      priority = 7;
    }

    const deduplicationId = `${job.urlHash}-${job.changeType}`;

    this.logger.info({ url: job.url, changeType: job.changeType }, 'Emitting new URL job');

    return this.adapter.enqueue(this.queueName, job, {
      priority,
      deduplicationId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  /**
   * Enqueues a batch of discovered URL jobs.
   * Jobs with ChangeType.REMOVED are filtered out.
   *
   * @param jobs - Array of jobs to enqueue.
   * @returns Resolves with array of EnqueueResults.
   */
  public async emitBatch(jobs: QueueJob[]): Promise<EnqueueResult[]> {
    const validJobs = jobs.filter(job => {
      try {
        this.validateJob(job);
        return job.changeType !== ChangeType.REMOVED;
      } catch (err) {
        this.logger.warn({ err, job }, 'Skipping invalid job in batch');
        return false;
      }
    });

    if (validJobs.length === 0) {
      return [];
    }

    this.logger.info({ batchSize: validJobs.length }, 'Emitting batch of URL jobs');

    return this.adapter.enqueueBatch(this.queueName, validJobs, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  /**
   * Gets the approximate number of jobs in the queue.
   *
   * @returns The queue depth.
   */
  public async getQueueDepth(): Promise<number> {
    return this.adapter.getQueueSize(this.queueName);
  }

  /**
   * Drains all jobs from the queue.
   */
  public async drain(): Promise<void> {
    await this.adapter.drain(this.queueName);
  }

  /**
   * Closes the queue adapter connections.
   */
  public async close(): Promise<void> {
    await this.adapter.close();
  }

  /**
   * Validates that the job has the required fields.
   *
   * @param job - The job to validate.
   */
  private validateJob(job: QueueJob): void {
    if (!job.url) throw new Error('Job must contain a url');
    if (!job.urlHash) throw new Error('Job must contain a urlHash');
    if (!job.changeType) throw new Error('Job must contain a changeType');
    if (!job.domain) throw new Error('Job must contain a domain');
  }
}
