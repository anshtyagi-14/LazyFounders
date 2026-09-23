import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

/** Called by the publishing service after a publish (Authorization: Bearer $REVALIDATE_SECRET). */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  const { paths } = (await request.json().catch(() => ({}))) as { paths?: unknown };
  const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string' && /^\/[\w\-/%.]*$/.test(p)).slice(0, 20) : [];
  for (const p of list) revalidatePath(p);
  revalidatePath('/sitemap.xml');
  return NextResponse.json({ success: true, revalidated: list });
}
