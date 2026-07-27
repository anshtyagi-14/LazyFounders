import type { Logger } from 'pino';
import type { QueueJob } from '@lazyfounders/shared';
import type { IQueueAdapter, EnqueueOptions, EnqueueResult } from './types.js';

export interface SQSConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  queueUrls: Record<string, string>;
}

/**
 * AWS SQS adapter implementation for the Queue Abstraction layer.
 * Uses dynamic imports to lazily load the AWS SDK.
 */
export class SQSAdapter implements IQueueAdapter {
  private sqsClient: any = null;
  private readonly config: SQSConfig;
  private readonly logger: Logger;
  private initialized = false;
  // Type references for the AWS SDK to avoid compile time requirements if not present
  private SQSClientClass: any;
  private SendMessageCommandClass: any;
  private SendMessageBatchCommandClass: any;
  private GetQueueAttributesCommandClass: any;
  private PurgeQueueCommandClass: any;

  /**
   * Initializes a new SQSAdapter.
   *
   * @param config - SQS configuration containing region, credentials, and queue URLs.
   * @param logger - Logger instance.
   */
  constructor(config: SQSConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Lazily loads the AWS SDK and initializes the SQS client.
   */
  private async getClient(): Promise<any> {
    if (this.sqsClient) {
      return this.sqsClient;
    }

    if (!this.initialized) {
      try {
        const awsClientSqs = await import('@aws-sdk/client-sqs');
        this.SQSClientClass = awsClientSqs.SQSClient;
        this.SendMessageCommandClass = awsClientSqs.SendMessageCommand;
        this.SendMessageBatchCommandClass = awsClientSqs.SendMessageBatchCommand;
        this.GetQueueAttributesCommandClass = awsClientSqs.GetQueueAttributesCommand;
        this.PurgeQueueCommandClass = awsClientSqs.PurgeQueueCommand;
        this.initialized = true;
      } catch (error) {
        throw new Error(
          '@aws-sdk/client-sqs must be installed for SQS adapter. Run: npm install @aws-sdk/client-sqs'
        );
      }
    }

    const clientConfig: any = { region: this.config.region };
    
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      };
    }

    this.sqsClient = new this.SQSClientClass(clientConfig);
    this.logger.info({ region: this.config.region }, 'Initialized SQS client');
    
    return this.sqsClient;
  }

  /**
   * Maps a logical queue name to an SQS Queue URL based on configuration.
   *
   * @param queueName - Target queue name.
   * @returns SQS Queue URL.
   */
  private getQueueUrl(queueName: string): string {
    const queueUrl = this.config.queueUrls[queueName];
    if (!queueUrl) {
      throw new Error(`SQS queue URL not configured for queue name: ${queueName}`);
    }
    return queueUrl;
  }

  /**
   * Enqueues a single job to the specified SQS queue.
   *
   * @param queueName - Target queue name.
   * @param job - Job payload.
   * @param options - Enqueue options.
   * @returns Resolves with EnqueueResult containing the messageId.
   */
  public async enqueue(queueName: string, job: QueueJob, options?: EnqueueOptions): Promise<EnqueueResult> {
    const client = await this.getClient();
    const queueUrl = this.getQueueUrl(queueName);
    const isFifo = queueUrl.endsWith('.fifo');

    const params: any = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(job),
    };

    if (isFifo) {
      params.MessageGroupId = job.domain || 'default-group';
      const deduplicationId = options?.deduplicationId || job.urlHash;
      if (deduplicationId) {
        params.MessageDeduplicationId = deduplicationId;
      }
    } else if (options?.delay !== undefined) {
      params.DelaySeconds = Math.floor(options.delay / 1000);
    }

    const command = new this.SendMessageCommandClass(params);
    const response = await client.send(command);

    this.logger.debug({ queueName, messageId: response.MessageId }, 'Enqueued job to SQS');

    return {
      jobId: response.MessageId,
      queue: queueName,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Enqueues a batch of jobs to the specified SQS queue (max 10 per batch, chunked).
   *
   * @param queueName - Target queue name.
   * @param jobs - Array of job payloads.
   * @param options - Enqueue options.
   * @returns Resolves with array of EnqueueResults.
   */
  public async enqueueBatch(queueName: string, jobs: QueueJob[], options?: EnqueueOptions): Promise<EnqueueResult[]> {
    if (jobs.length === 0) return [];

    const client = await this.getClient();
    const queueUrl = this.getQueueUrl(queueName);
    const isFifo = queueUrl.endsWith('.fifo');
    const results: EnqueueResult[] = [];

    // SQS SendMessageBatch supports max 10 messages
    const CHUNK_SIZE = 10;
    
    for (let i = 0; i < jobs.length; i += CHUNK_SIZE) {
      const chunk = jobs.slice(i, i + CHUNK_SIZE);
      
      const entries = chunk.map((job, index) => {
        const id = `${i + index}`;
        const entry: any = {
          Id: id,
          MessageBody: JSON.stringify(job),
        };

        if (isFifo) {
          entry.MessageGroupId = job.domain || 'default-group';
          const deduplicationId = options?.deduplicationId || job.urlHash || id;
          entry.MessageDeduplicationId = deduplicationId;
        } else if (options?.delay !== undefined) {
          entry.DelaySeconds = Math.floor(options.delay / 1000);
        }
        
        return entry;
      });

      const params = {
        QueueUrl: queueUrl,
        Entries: entries,
      };

      const command = new this.SendMessageBatchCommandClass(params);
      const response = await client.send(command);

      if (response.Successful) {
        for (const success of response.Successful) {
          results.push({
            jobId: success.MessageId,
            queue: queueName,
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (response.Failed && response.Failed.length > 0) {
        this.logger.error({ queueName, failedCount: response.Failed.length }, 'Failed to enqueue some SQS messages in batch');
        // Depending on requirements, we could throw here or continue
      }
    }

    this.logger.debug({ queueName, count: results.length }, 'Enqueued batch to SQS');
    return results;
  }

  /**
   * Gets the approximate number of messages available and in flight in the SQS queue.
   *
   * @param queueName - Target queue name.
   * @returns Resolves with total count.
   */
  public async getQueueSize(queueName: string): Promise<number> {
    const client = await this.getClient();
    const queueUrl = this.getQueueUrl(queueName);

    const command = new this.GetQueueAttributesCommandClass({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    });

    const response = await client.send(command);
    
    const available = parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10);
    const inFlight = parseInt(response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0', 10);
    
    return available + inFlight;
  }

  /**
   * Purges the SQS queue. Note: AWS allows purging a queue once every 60 seconds.
   *
   * @param queueName - Target queue name.
   */
  public async drain(queueName: string): Promise<void> {
    const client = await this.getClient();
    const queueUrl = this.getQueueUrl(queueName);

    const command = new this.PurgeQueueCommandClass({
      QueueUrl: queueUrl,
    });

    await client.send(command);
    this.logger.info({ queueName }, 'Purged SQS queue');
  }

  /**
   * Closes the SQS client by destroying it.
   */
  public async close(): Promise<void> {
    if (this.sqsClient) {
      this.sqsClient.destroy();
      this.sqsClient = null;
      this.logger.info('Closed SQS client');
    }
  }
}
