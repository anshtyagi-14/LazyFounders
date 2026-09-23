import { handle, requireEditor } from '@/lib/api';
import { listSourceReviews } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    requireEditor(request);
    return listSourceReviews();
  });
}
