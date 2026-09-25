import { siteHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Public liveness/readiness probe for the ALB target group and the uptime
 * monitor. 503 only when the database is down; a degraded dependency still
 * answers 200 so the load balancer keeps routing traffic to a working page.
 */
export async function GET() {
  const health = await siteHealth();
  return Response.json(health, {
    status: health.status === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
