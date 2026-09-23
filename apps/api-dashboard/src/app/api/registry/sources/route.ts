import { handle, requireEditor } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    requireEditor(request, 'admin');
    return prisma.source.findMany({
      where: { registryKey: { not: null } },
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        registryKey: true,
        name: true,
        domain: true,
        country: true,
        defaultLanguage: true,
        trustStatus: true,
        enabled: true,
        feedUrls: true,
        customSitemapUrls: true,
        crawlIntervalMinutes: true,
        rateLimitPerMinute: true,
        renderPolicy: true,
        publishingPolicy: true,
        failureStatus: true,
        consecutiveFailures: true,
        lastError: true,
        lastSuccessfulScanAt: true,
        lastChangeDetectedAt: true,
      },
    });
  });
}
