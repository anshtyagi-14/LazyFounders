'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isStoryImageMode, setStoryImageMode } from '@/lib/site-settings';

/**
 * Switch every story between our cover cards and publisher photos. Admin only (the
 * proxy already limits /admin/settings to admins). Revalidates the whole site so
 * cached pages pick the new images up on their next request.
 */
export async function updateStoryImageMode(mode: string): Promise<void> {
  const h = await headers();
  const editor = h.get('x-editor-user');
  if (!editor || h.get('x-editor-role') !== 'admin') throw new Error('Not authorised');
  if (!isStoryImageMode(mode)) throw new Error('Unknown mode');
  await setStoryImageMode(mode, editor);
  revalidatePath('/', 'layout');
}
