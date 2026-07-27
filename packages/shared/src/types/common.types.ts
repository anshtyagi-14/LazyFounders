export interface TraceContext {
  traceId: string;
  sourceId: string;
  domain: string;
  startedAt: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
