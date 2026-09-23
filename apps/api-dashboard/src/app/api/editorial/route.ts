import { handle, requireEditor } from '@/lib/api';
import { listEditorialQueue } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    requireEditor(request);
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    return listEditorialQueue(status);
  });
}
