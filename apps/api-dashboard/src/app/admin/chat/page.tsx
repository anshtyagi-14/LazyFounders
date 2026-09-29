import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { CHAT_STATUSES, isChatStatus } from '@/lib/founder-chat';
import { AutoRefresh } from '../pipeline/controls';

/** "Talk to founder" conversations from the public site's chat widget, unanswered first. */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;
const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };

type Props = { searchParams: Promise<{ status?: string }> };

export default async function FounderChatInbox({ searchParams }: Props) {
  const requested = (await searchParams).status;
  const status = isChatStatus(requested) ? requested : 'open';

  const [chats, counts, unanswered] = await Promise.all([
    prisma.founderChat.findMany({
      where: { status },
      orderBy: [{ unreadByAdmin: 'desc' }, { lastMessageAt: 'desc' }],
      take: PAGE_SIZE,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    prisma.founderChat.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.founderChat.count({ where: { unreadByAdmin: { gt: 0 } } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Founder chat</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Conversations from the &ldquo;Talk to founder&rdquo; button on the site. {unanswered ? `${unanswered} waiting for a reply.` : 'Nothing waiting.'} Readers see
            replies in the chat window; nothing is emailed.
          </p>
        </div>
        <AutoRefresh seconds={15} />
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {CHAT_STATUSES.map((s) => {
          const active = s === status;
          return (
            <Link
              key={s}
              href={`/admin/chat?status=${s}`}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                active ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10'
              }`}
            >
              {s} ({countOf(s)})
            </Link>
          );
        })}
      </nav>

      {chats.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">No {status} conversations.</p>
      ) : (
        <ul className="space-y-2">
          {chats.map((c) => {
            const last = c.messages[0];
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/chat/${c.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-500/50 dark:border-white/10 dark:bg-[#0a0d14]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {c.name} <span className="font-normal text-slate-500 dark:text-slate-400">· {c.email}</span>
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {c.unreadByAdmin > 0 ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-400">{c.unreadByAdmin} new</span>
                      ) : null}
                      <span>{c.lastMessageAt.toLocaleString('en-IN', IST)} IST</span>
                    </div>
                  </div>
                  {last ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-500">{last.author === 'founder' ? 'You: ' : ''}</span>
                      {last.body}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {chats.length === PAGE_SIZE ? <p className="text-xs text-slate-500">Showing the {PAGE_SIZE} most recent.</p> : null}
    </div>
  );
}
