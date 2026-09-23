import { handle, requireEditor } from '@/lib/api';
import { EditorialError, approveArticle, archiveArticle, rejectArticle, requestPublish } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

/** POST /api/editorial/:id/{approve|reject|publish|archive}  body: { versionId?, note? } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  return handle(async () => {
    const editor = requireEditor(request);
    const { id, action } = await params;
    const body = (await request.json().catch(() => ({}))) as { versionId?: string; note?: string };
    switch (action) {
      case 'approve':
        if (!body.versionId) throw new EditorialError('versionId is required', 400);
        return approveArticle(id, body.versionId, editor, body.note);
      case 'reject':
        return rejectArticle(id, editor, body.note ?? '');
      case 'publish':
        if (!body.versionId) throw new EditorialError('versionId is required', 400);
        return requestPublish(id, body.versionId, editor);
      case 'archive':
        return archiveArticle(id, editor, body.note);
      default:
        throw new EditorialError(`Unknown action ${action}`, 404);
    }
  });
}
