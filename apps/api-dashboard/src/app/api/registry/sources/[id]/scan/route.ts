import { handle, requireEditor } from '@/lib/api';
import { EditorialError } from '@/lib/editorial';
import { internalHeaders } from '@/lib/internal';

export const dynamic = 'force-dynamic';

/** Queue an immediate scan (runs through the normal locked, idempotent discovery path). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = requireEditor(request, 'admin');
    const { id } = await params;
    const base = process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3001';
    const res = await fetch(`${base}/internal/sources/${encodeURIComponent(id)}/scan`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ requestedBy: admin.user }),
    });
    if (!res.ok) throw new EditorialError(`Discovery service refused the scan (${res.status})`, res.status === 404 ? 404 : 409);
    return { queued: true };
  });
}
