import { handle, requireEditor } from '@/lib/api';
import { EditorialError } from '@/lib/editorial';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PATCH { trustStatus?: 'APPROVED'|'PENDING'|'SUSPENDED', enabled?: boolean, crawlIntervalMinutes?: number }
 * Only APPROVED sources can be enabled; suspending a source also disables it.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = requireEditor(request, 'admin');
    const { id } = await params;
    const body = (await request.json()) as { trustStatus?: string; enabled?: boolean; crawlIntervalMinutes?: number };
    const source = await prisma.source.findUnique({ where: { id } });
    if (!source?.registryKey) throw new EditorialError('Registry source not found', 404);

    const data: { trustStatus?: string; enabled?: boolean; crawlIntervalMinutes?: number } = {};
    if (body.trustStatus !== undefined) {
      if (!['APPROVED', 'PENDING', 'SUSPENDED'].includes(body.trustStatus)) throw new EditorialError('invalid trustStatus', 400);
      data.trustStatus = body.trustStatus;
      if (body.trustStatus !== 'APPROVED') data.enabled = false;
    }
    if (body.enabled !== undefined) {
      const trust = data.trustStatus ?? source.trustStatus;
      if (body.enabled && trust !== 'APPROVED') throw new EditorialError('Only APPROVED sources can be enabled', 409);
      data.enabled = Boolean(body.enabled) && trust === 'APPROVED';
    }
    if (body.crawlIntervalMinutes !== undefined) {
      const n = Number(body.crawlIntervalMinutes);
      if (!Number.isInteger(n) || n < 5 || n > 1440) throw new EditorialError('crawlIntervalMinutes must be 5..1440', 400);
      data.crawlIntervalMinutes = n;
    }
    const updated = await prisma.source.update({ where: { id }, data });
    console.info(JSON.stringify({ msg: 'registry source updated', source: source.registryKey, by: admin.user, changes: data }));
    return { id: updated.id, trustStatus: updated.trustStatus, enabled: updated.enabled, crawlIntervalMinutes: updated.crawlIntervalMinutes };
  });
}
