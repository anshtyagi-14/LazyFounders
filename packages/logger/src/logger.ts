import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';

export type Logger = PinoLogger;

export interface CreateLoggerOptions {
  /**
   * The name of the service or application.
   */
  name: string;
  /**
   * The minimum log level to output.
   * @default "info"
   */
  level?: string;
  /**
   * Whether to force pretty printing regardless of NODE_ENV.
   */
  prettyPrint?: boolean;
}

/**
 * Creates a configured Pino logger instance.
 * 
 * @param options - Configuration options for the logger.
 * @returns A Pino Logger instance.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { name, level = 'info', prettyPrint = false } = options;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const shouldUsePrettyPrint = prettyPrint || isDevelopment;

  const loggerOptions: LoggerOptions = {
    name,
    level,
    base: {
      service: name,
      version: process.env.npm_package_version || '0.0.0',
      env: process.env.NODE_ENV || 'development',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const targets: any[] = [];

  if (shouldUsePrettyPrint) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  } else {
    // In production (like AWS ECS), we MUST log to stdout so CloudWatch can capture the logs!
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // 1 = stdout
    });
  }

  // Always add pino-roll for daily log rotation and automatic cleanup
  targets.push({
    target: 'pino-roll',
    options: {
      file: process.env.NODE_ENV === 'production' ? `/tmp/logs/${name}.log` : `logs/${name}.log`,
      frequency: 'daily',
      mkdir: true,
      limit: {
        count: 3, // Keep only 3 older files (deletes after 3 days)
      },
    },
  });

  return pino({
    ...loggerOptions,
    transport: {
      targets,
    },
  });
}
