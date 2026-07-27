import pino from 'pino';
import { PipelineOrchestrator } from '../orchestrator/pipeline-orchestrator';

export class CronScheduler {
  private readonly prisma: any;
  private readonly pipelineOrchestrator: PipelineOrchestrator;
  private readonly logger: pino.Logger;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private readonly pollingIntervalMs: number;

  constructor(
    prisma: any,
    pipelineOrchestrator: PipelineOrchestrator,
    logger: pino.Logger,
    pollingIntervalMs: number = 60000 // default to 1 minute
  ) {
    this.prisma = prisma;
    this.pipelineOrchestrator = pipelineOrchestrator;
    this.logger = logger;
    this.pollingIntervalMs = pollingIntervalMs;
  }

  public start(): void {
    if (this.intervalId) {
      this.logger.warn('CronScheduler is already running');
      return;
    }

    this.logger.info(`Starting CronScheduler with polling interval ${this.pollingIntervalMs}ms`);
    this.intervalId = setInterval(() => {
      this.tick().catch(err => {
        this.logger.error(err, 'Error in CronScheduler tick');
      });
    }, this.pollingIntervalMs);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.logger.info('CronScheduler stopped');
    }
  }

  private async tick(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous tick is still running, skipping this tick');
      return;
    }

    this.isRunning = true;
    try {
      this.logger.debug('Running scheduler tick');
      const activeSources = await this.prisma.source.findMany({
        where: {
          enabled: true,
        },
      });

      const now = new Date();

      for (const source of activeSources) {
        const intervalMinutes = source.discoveryIntervalMinutes || 60;
        const lastRunAt = source.lastDiscoveryRunAt || new Date(0);
        
        const nextRunTime = new Date(lastRunAt.getTime() + intervalMinutes * 60000);

        if (now >= nextRunTime) {
          this.logger.info({ sourceId: source.id }, 'Triggering scheduled discovery for source');
          // Update lastRunAt to prevent immediate re-trigger
          await this.prisma.source.update({
        where: {
          id: source.id,
        },
        data: {
          lastCrawledAt: new Date(),
        },
      });    
          this.pipelineOrchestrator.runDiscovery(source.id).catch(err => {
            this.logger.error({ err, sourceId: source.id }, 'Failed to run discovery for source');
          });
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
