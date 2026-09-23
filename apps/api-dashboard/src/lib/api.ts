import { NextResponse } from 'next/server';
import { editorFromHeaders, type Editor } from '@/lib/editor-auth';
import { EditorialError } from '@/lib/editorial';

/** Identity is set by proxy.ts after Basic Auth; routes never trust the client for it. */
export function requireEditor(request: Request, role: 'editor' | 'admin' = 'editor'): Editor {
  const editor = editorFromHeaders(request.headers);
  if (!editor) throw new EditorialError('Authentication required', 401);
  if (role === 'admin' && editor.role !== 'admin') throw new EditorialError('Admin role required', 403);
  return editor;
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json({ success: true, data: data ?? null });
  } catch (err) {
    if (err instanceof EditorialError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error(JSON.stringify({ msg: 'editorial api error', error: (err as Error).message }));
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
