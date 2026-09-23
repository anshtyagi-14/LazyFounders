import { handle, requireEditor } from '@/lib/api';
import { EditorialError, resolvePossibleDuplicate } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

/** POST /api/editorial/stories/:storyId  body: { action: 'keep' } | { action: 'merge', targetStoryId } */
export async function POST(request: Request, { params }: { params: Promise<{ storyId: string }> }) {
  return handle(async () => {
    const editor = requireEditor(request);
    const { storyId } = await params;
    const body = (await request.json()) as { action?: string; targetStoryId?: string };
    if (body.action !== 'keep' && body.action !== 'merge') throw new EditorialError('action must be keep or merge', 400);
    return resolvePossibleDuplicate(storyId, editor, body.action, body.targetStoryId);
  });
}
