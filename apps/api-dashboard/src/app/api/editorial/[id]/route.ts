import { handle, requireEditor } from '@/lib/api';
import { EditorialError, editArticle, getEditorialArticle } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireEditor(request);
    const { id } = await params;
    const article = await getEditorialArticle(id);
    if (!article) throw new EditorialError('Article not found', 404);
    return article;
  });
}

const EDITABLE = ['headline', 'seoTitle', 'metaDescription', 'intro', 'bodyMarkdown'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const editor = requireEditor(request);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Partial<Record<(typeof EDITABLE)[number], string>> = {};
    for (const k of EDITABLE) {
      if (body[k] === undefined) continue;
      if (typeof body[k] !== 'string' || !(body[k] as string).trim()) throw new EditorialError(`${k} must be a non-empty string`, 400);
      if ((body[k] as string).length > 100_000) throw new EditorialError(`${k} is too long`, 400);
      patch[k] = body[k] as string;
    }
    return editArticle(id, editor, patch);
  });
}
