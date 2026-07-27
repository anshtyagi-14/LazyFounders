import { Logger } from './logger';

/**
 * Creates a child logger with the provided bindings.
 * 
 * @param parent - The parent logger instance.
 * @param bindings - The bindings to merge into the child logger.
 * @returns A new child logger.
 */
export function createChildLogger(parent: Logger, bindings: Record<string, unknown>): Logger {
  return parent.child(bindings);
}

/**
 * Creates a child logger that includes a trace ID for request tracing.
 * 
 * @param logger - The parent logger instance.
 * @param traceId - The unique trace identifier.
 * @returns A new child logger with the traceId bound.
 */
export function withTraceId(logger: Logger, traceId: string): Logger {
  return createChildLogger(logger, { traceId });
}

/**
 * Creates a child logger scoped to a specific business domain.
 * 
 * @param logger - The parent logger instance.
 * @param domain - The name of the business domain.
 * @returns A new child logger with the domain bound.
 */
export function withDomain(logger: Logger, domain: string): Logger {
  return createChildLogger(logger, { domain });
}

/**
 * Creates a child logger scoped to a specific source and domain.
 * Useful for data ingestion or fetching processes.
 * 
 * @param logger - The parent logger instance.
 * @param sourceId - The identifier for the data source.
 * @param domain - The business domain.
 * @returns A new child logger with sourceId and domain bound.
 */
export function withSource(logger: Logger, sourceId: string, domain: string): Logger {
  return createChildLogger(logger, { sourceId, domain });
}

/**
 * Creates a child logger scoped to a specific component (e.g., service, controller, repository).
 * 
 * @param logger - The parent logger instance.
 * @param component - The name of the component.
 * @returns A new child logger with the component bound.
 */
export function withComponent(logger: Logger, component: string): Logger {
  return createChildLogger(logger, { component });
}
