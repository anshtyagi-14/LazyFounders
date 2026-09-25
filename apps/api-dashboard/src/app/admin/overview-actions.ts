'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

/** Mark a site error resolved (or reopen it). The proxy already requires an editor login. */
export async function setSiteErrorResolved(id: string, resolved: boolean): Promise<void> {
  const editor = (await headers()).get('x-editor-user');
  if (!editor) throw new Error('Not authorised');
  await prisma.siteError.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  revalidatePath('/admin');
}
