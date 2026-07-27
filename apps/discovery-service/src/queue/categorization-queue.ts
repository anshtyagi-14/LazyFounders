import type { Logger } from 'pino';
import { QueueJob, QueueNames } from '@lazyfounders/shared';
import type { IQueueAdapter, EnqueueResult } from './types.js';

/**
 * High-level queue wrapper for dispatching categorization jobs.
 */
export class CategorizationQueue {
  private readonly adapter: IQueueAdapter;
  private readonly logger: Logger;
  private readonly queueName = QueueNames.CATEGORIZATION_JOBS;

  /**
   * Initializes a new CategorizationQueue.
   *
   * @param adapter - The underlying queue adapter to use.
   * @param logger - Logger instance.
   */
  constructor(adapter: IQueueAdapter, logger: Logger) {
    this.adapter = adapter;
    this.logger = logger.child({ queue: this.queueName, component: 'CategorizationQueue' });
  }

  /**
   * Enqueues a single categorization job.
   *
   * @param job - The job payload to enqueue.
   * @returns Resolves with EnqueueResult.
   */
  public async emitCategorizationJob(job: QueueJob): Promise<EnqueueResult> {
    this.validateJob(job);

    const priority = typeof job.metadata?.priority === 'number' ? job.metadata.priority : 5;
    const deduplicationId = job.urlHash;

    this.logger.info({ url: job.url, priority }, 'Emitting categorization job');

    return this.adapter.enqueue(this.queueName, job, {
      priority,
      deduplicationId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  /**
   * Enqueues a batch of categorization jobs.
   *
   * @param jobs - Array of job payloads to enqueue.
   * @returns Resolves with an array of EnqueueResults.
   */
  public async emitBatch(jobs: QueueJob[]): Promise<EnqueueResult[]> {
    const validJobs = jobs.filter(job => {
      try {
        this.validateJob(job);
        return true;
      } catch (err) {
        this.logger.warn({ err, job }, 'Skipping invalid categorization job in batch');
        return false;
      }
    });

    if (validJobs.length === 0) {
      return [];
    }

    this.logger.info({ batchSize: validJobs.length }, 'Emitting batch of categorization jobs');

    return this.adapter.enqueueBatch(this.queueName, validJobs, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  /**
   * Gets the approximate number of jobs in the categorization queue.
   *
   * @returns The queue depth.
   */
  public async getQueueDepth(): Promise<number> {
    return this.adapter.getQueueSize(this.queueName);
  }

  /**
   * Drains all jobs from the categorization queue.
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
    if (!job.domain) throw new Error('Job must contain a domain');
  }
}
