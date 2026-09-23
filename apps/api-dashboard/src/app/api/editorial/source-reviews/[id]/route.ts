import { handle, requireEditor } from '@/lib/api';
import { EditorialError, resolveSourceReview } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

/** POST /api/editorial/source-reviews/:id  body: { action: 'retry' | 'accept_translation' | 'reject' } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const editor = requireEditor(request);
    const { id } = await params;
    const { action } = (await request.json()) as { action?: string };
    if (action !== 'retry' && action !== 'accept_translation' && action !== 'reject') throw new EditorialError('invalid action', 400);
    return resolveSourceReview(id, editor, action);
  });
}
