'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeChatStatus, replyToChat } from '../actions';

export function ChatReplyForm({ id, closed }: { id: string; closed: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        setError('');
        start(async () => {
          const res = await replyToChat(id, draft);
          if (!res.ok) return setError(res.error);
          setDraft('');
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <label htmlFor="founder-reply" className="block text-sm font-medium">
        Reply {closed ? <span className="font-normal text-slate-500">(sending reopens the conversation)</span> : null}
      </label>
      <textarea
        id="founder-reply"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="The reader sees this in the chat window on the site."
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#0d1117]"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send reply'}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function ChatStatusButton({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const next = status === 'closed' ? 'open' : 'closed';
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => changeChatStatus(id, next))}
      className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:bg-white/10 dark:text-slate-200"
    >
      {status === 'closed' ? 'Reopen conversation' : 'Close conversation'}
    </button>
  );
}
