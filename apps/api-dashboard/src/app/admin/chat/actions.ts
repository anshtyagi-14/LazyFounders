'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isChatStatus, postFounderReply, setChatStatus } from '@/lib/founder-chat';

async function editorOrThrow(): Promise<string> {
  const editor = (await headers()).get('x-editor-user');
  if (!editor) throw new Error('Not authorised');
  return editor;
}

/** Answer a conversation as the founder. The proxy already requires an editor login. */
export async function replyToChat(id: string, message: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const editor = await editorOrThrow();
  const outcome = await postFounderReply(id, editor, { message });
  if (outcome.kind === 'invalid') return { ok: false, error: outcome.message };
  if (outcome.kind !== 'posted') return { ok: false, error: 'Conversation not found.' };
  revalidatePath('/admin/chat');
  revalidatePath(`/admin/chat/${id}`);
  return { ok: true };
}

export async function changeChatStatus(id: string, status: string): Promise<void> {
  await editorOrThrow();
  if (!isChatStatus(status)) throw new Error('Unknown status');
  await setChatStatus(id, status);
  revalidatePath('/admin/chat');
  revalidatePath(`/admin/chat/${id}`);
}
