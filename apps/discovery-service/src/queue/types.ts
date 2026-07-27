import type { QueueJob } from '@lazyfounders/shared';

/** Options for job enqueue */
export interface EnqueueOptions {
  /** Job priority (lower = higher priority). Default: 5 */
  priority?: number;
  /** Delay before job becomes available (ms) */
  delay?: number;
  /** Number of retry attempts. Default: 3 */
  attempts?: number;
  /** Backoff strategy */
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  /** Job deduplication key. If set, duplicate jobs with same key are rejected */
  deduplicationId?: string;
  /** Time to live for the job (ms). Job is removed if not processed within TTL */
  ttl?: number;
}

/** Result of an enqueue operation */
export interface EnqueueResult {
  jobId: string;
  queue: string;
  timestamp: string;
}

/** Common queue adapter interface — abstracts BullMQ and SQS */
export interface IQueueAdapter {
  /** Enqueue a single job */
  enqueue(queueName: string, job: QueueJob, options?: EnqueueOptions): Promise<EnqueueResult>;
  
  /** Enqueue multiple jobs in a batch */
  enqueueBatch(queueName: string, jobs: QueueJob[], options?: EnqueueOptions): Promise<EnqueueResult[]>;
  
  /** Get approximate queue size */
  getQueueSize(queueName: string): Promise<number>;
  
  /** Drain (empty) a queue */
  drain(queueName: string): Promise<void>;
  
  /** Close connections */
  close(): Promise<void>;
}

/** Job handler function type */
export type JobHandler = (job: QueueJob, metadata: JobMetadata) => Promise<void>;

/** Metadata provided to job handlers */
export interface JobMetadata {
  jobId: string;
  attemptNumber: number;
  queueName: string;
  timestamp: Date;
}

/** Worker interface for consuming jobs */
export interface IQueueWorker {
  /** Start processing jobs */
  start(): Promise<void>;
  /** Stop processing jobs gracefully */
  stop(): Promise<void>;
  /** Check if worker is running */
  isRunning(): boolean;
}
