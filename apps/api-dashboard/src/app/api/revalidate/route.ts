import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { canonicalSitePath } from '@/lib/topics';
import { coverPath } from '@/lib/covers';

/** Called by the publishing service after a publish (Authorization: Bearer $REVALIDATE_SECRET). */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  const { paths } = (await request.json().catch(() => ({}))) as { paths?: unknown };
  const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string' && /^\/[\w\-/%.]*$/.test(p)).slice(0, 20) : [];
  const targets = new Set<string>();
  for (const p of list.map(canonicalSitePath)) {
    targets.add(p);
    // A story's cover cards carry its headline and section, so they refresh with it.
    const story = /^\/news\/([^/]+)$/.exec(p);
    if (story && story[1] !== 'category') for (const variant of ['social', 'art'] as const) targets.add(coverPath(story[1], variant));
  }
  for (const p of targets) revalidatePath(p);
  revalidatePath('/sitemap.xml');
  return NextResponse.json({ success: true, revalidated: list });
}
