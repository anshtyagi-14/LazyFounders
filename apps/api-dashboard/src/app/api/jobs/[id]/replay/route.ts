import { handle, requireEditor } from '@/lib/api';
import { replayJob } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

/** Admin only (also enforced in proxy.ts). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = requireEditor(request, 'admin');
    const { id } = await params;
    const job = await replayJob(id, admin);
    return { id: job.id, stage: job.stage, replayCount: job.replayCount };
  });
}
