'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { isLeadStatus } from '@/lib/leads';

/** Move a lead through new → contacted → closed. The proxy already requires an editor login. */
export async function setLeadStatus(id: string, status: string): Promise<void> {
  const editor = (await headers()).get('x-editor-user');
  if (!editor) throw new Error('Not authorised');
  if (!isLeadStatus(status)) throw new Error('Unknown status');
  await prisma.lead.update({ where: { id }, data: { status } });
  revalidatePath('/admin/leads');
}
