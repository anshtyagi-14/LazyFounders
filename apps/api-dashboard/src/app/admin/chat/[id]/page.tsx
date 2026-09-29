import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { markAdminRead } from '@/lib/founder-chat';
import { AutoRefresh } from '../../pipeline/controls';
import { ChatReplyForm, ChatStatusButton } from './ChatControls';

export const dynamic = 'force-dynamic';

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };

type Props = { params: Promise<{ id: string }> };

export default async function FounderChatThread({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const chat = await prisma.founderChat.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
  if (!chat) notFound();
  // Showing the thread to an editor is what "read" means here.
  if (chat.unreadByAdmin > 0) await markAdminRead(id);

  const utm = [chat.utmSource, chat.utmMedium, chat.utmCampaign].filter(Boolean).join(' / ');

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/chat" className="text-xs font-medium text-slate-500 hover:underline">
            ← All conversations
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{chat.name}</h1>
          <p className="mt-1 text-sm">
            <a href={`mailto:${chat.email}`} className="text-teal-700 hover:underline dark:text-teal-400">
              {chat.email}
            </a>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Started {chat.createdAt.toLocaleString('en-IN', IST)} IST
            {chat.pagePath ? (
              <>
                {' · on '}
                <a href={chat.pagePath} target="_blank" rel="noreferrer" className="underline">
                  {chat.pagePath}
                </a>
              </>
            ) : null}
            {chat.referrer ? ` · via ${chat.referrer}` : ''}
            {utm ? ` · utm ${utm}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ChatStatusButton id={chat.id} status={chat.status} />
          <AutoRefresh seconds={15} />
        </div>
      </div>

      <ol className="space-y-3">
        {chat.messages.map((m) => (
          <li key={m.id} className={`flex ${m.author === 'founder' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                m.author === 'founder' ? 'bg-teal-500/15 text-slate-900 dark:text-white' : 'border border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-[#0a0d14] dark:text-slate-200'
              }`}
            >
              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {m.author === 'founder' ? `Reply by ${m.editor ?? 'editor'}` : chat.name} · {m.createdAt.toLocaleString('en-IN', IST)} IST
              </p>
            </div>
          </li>
        ))}
      </ol>

      <ChatReplyForm id={chat.id} closed={chat.status === 'closed'} />
    </div>
  );
}
