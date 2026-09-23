/** Headers for dashboard -> backend service calls (validated by each service). */
export function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN;
  return { ...extra, ...(token ? { 'x-internal-token': token } : {}) };
}
