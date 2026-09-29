'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics';
import { ChatIcon, OPEN_FOUNDER_CHAT } from './TalkToFounderButton';

/** The internal consoles are not part of the publication. */
const HIDDEN_PREFIXES = ['/admin', '/dashboard'];
const STORAGE_KEY = 'lf-founder-chat';
const POLL_MS = 10_000;
const MAX_CHARS = 2000;

type Session = { id: string; token: string };
type Message = { id: string; author: 'visitor' | 'founder'; body: string; createdAt: string };
type Chat = { id: string; status: 'open' | 'closed'; messages: Message[] };

// Storage can throw (private windows, blocked site data); the chat then lasts for the page view.
function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Session>) : null;
    return s && typeof s.id === 'string' && typeof s.token === 'string' ? { id: s.id, token: s.token } : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* see loadSession */
  }
}

function utm(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' };

const fieldClass =
  'w-full border border-black/15 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-teal-600 focus:outline-none dark:border-white/15 dark:bg-black/40 dark:text-white';
const buttonClass =
  'inline-flex min-h-10 items-center justify-center bg-teal-500 px-4 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-teal-400 disabled:cursor-wait disabled:opacity-70';

/**
 * "Talk to founder": the floating button plus the chat panel, mounted once in the root
 * layout. A reader starts a conversation with name, email and a message; an editor
 * answers from /admin/chat; the panel polls while open so the answer shows up here.
 * Other buttons open it through the OPEN_FOUNDER_CHAT window event.
 */
export function FounderChat() {
  const pathname = usePathname() ?? '';
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const uid = useId();

  const [open, setOpen] = useState(false);
  // Read once on the client. The server renders the same markup either way: only the
  // closed launcher is visible until someone opens the panel.
  const [session, setSession] = useState<Session | null>(() => (typeof window === 'undefined' ? null : loadSession()));
  const [chat, setChat] = useState<Chat | null>(null);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [thanks, setThanks] = useState(false);
  const renderedAt = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const forget = useCallback(() => {
    saveSession(null);
    setSession(null);
    setChat(null);
    setUnread(0);
  }, []);

  const headersFor = (s: Session) => ({ 'x-chat-token': s.token });

  // A conversation from an earlier visit: show whether the founder has answered since.
  const restored = useRef(session);
  useEffect(() => {
    renderedAt.current = Date.now();
    const s = restored.current;
    if (!s) return;
    fetch(`/api/chat/${s.id}?unread=1`, { headers: headersFor(s), cache: 'no-store' })
      .then((r) => (r.status === 404 ? (forget(), null) : r.ok ? r.json() : null))
      .then((d: { unread?: number } | null) => setUnread(d?.unread ?? 0))
      .catch(() => {});
  }, [forget]);

  const openPanel = useCallback((surface: string) => {
    setOpen(true);
    track('founder_chat_open', { source_surface: surface });
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => openPanel((e as CustomEvent<{ surface?: string }>).detail?.surface ?? 'unknown');
    window.addEventListener(OPEN_FOUNDER_CHAT, onOpen);
    return () => window.removeEventListener(OPEN_FOUNDER_CHAT, onOpen);
  }, [openPanel]);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(`/api/chat/${session.id}`, { headers: headersFor(session), cache: 'no-store' });
      if (r.status === 404) return forget();
      if (!r.ok) return;
      const d = (await r.json()) as { chat: Chat };
      setChat(d.chat);
      setUnread(0);
    } catch {
      /* offline: the next poll tries again */
    }
  }, [session, forget]);

  // Poll only while the panel is open.
  useEffect(() => {
    if (!open || !session) return;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [open, session, refresh]);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, session]);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat?.messages.length, open]);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (k: string) => String(form.get(k) ?? '');
    setSending(true);
    setError('');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: field('name'),
          email: field('email'),
          message: field('message'),
          company_website: field('company_website'),
          renderedAt: renderedAt.current,
          pagePath: window.location.pathname,
          utmSource: utm('utm_source'),
          utmMedium: utm('utm_medium'),
          utmCampaign: utm('utm_campaign'),
          referrer: document.referrer || undefined,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string; token?: string; error?: string };
      if (!r.ok || !d.ok) {
        setError(r.status === 429 ? 'Too many conversations started from here. Please try again later.' : d.error || 'Something went wrong. Please try again.');
        return;
      }
      track('founder_chat_start', { source_surface: 'founder_chat' });
      if (d.id && d.token) {
        const s = { id: d.id, token: d.token };
        saveSession(s);
        setSession(s);
      } else {
        setThanks(true);
      }
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const r = await fetch(`/api/chat/${session.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headersFor(session) },
        body: JSON.stringify({ message: draft }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: Message; error?: string };
      if (r.status === 404) return forget();
      if (!r.ok || !d.ok || !d.message) {
        setError(r.status === 429 ? 'You are sending messages quickly. Please wait a moment.' : d.error || 'Could not send. Please try again.');
        if (r.status === 409) void refresh();
        return;
      }
      setDraft('');
      setChat((c) => (c ? { ...c, messages: [...c.messages, d.message!] } : c));
      track('founder_chat_message', { source_surface: 'founder_chat' });
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (hidden) return null;

  const panelId = `${uid}-panel`;

  return (
    <>
      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${uid}-title`}
          className="fixed right-4 bottom-20 z-50 flex max-h-[min(34rem,calc(100dvh-7rem))] w-[min(23rem,calc(100vw-2rem))] flex-col border border-teal-500/40 bg-white shadow-2xl shadow-black/30 sm:right-6 sm:bottom-24 dark:bg-[#0e0e11]"
        >
          <header className="flex items-start justify-between gap-3 bg-[#0B0B0E] px-4 py-3 text-white">
            <div>
              <h2 id={`${uid}-title`} className="font-display text-sm font-bold uppercase tracking-[0.12em] text-teal-500">
                Talk to the founder
              </h2>
              <p className="mt-0.5 text-xs text-white/70">Questions, pitches, partnerships. The founder reads and answers every message.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                launcherRef.current?.focus();
              }}
              aria-label="Close chat"
              className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center text-white/70 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          {session ? (
            <>
              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
                {!chat ? <p className="text-sm text-gray-500">Loading your conversation…</p> : null}
                {chat?.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.author === 'visitor' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
                        m.author === 'visitor' ? 'bg-teal-500/15 text-gray-900 dark:text-white' : 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white'
                      }`}
                    >
                      {m.author === 'founder' ? <p className="mb-0.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-400">Founder</p> : null}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-[0.65rem] text-gray-500 dark:text-gray-400">{new Date(m.createdAt).toLocaleString('en-IN', TIME)}</p>
                    </div>
                  </div>
                ))}
                {chat && chat.messages.every((m) => m.author === 'visitor') ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sent. The reply will appear here, so check back later; this browser keeps the conversation.</p>
                ) : null}
              </div>
              {chat?.status === 'closed' ? (
                <div className="border-t border-black/10 px-4 py-3 text-sm dark:border-white/10">
                  <p className="text-gray-600 dark:text-gray-400">This conversation is closed.</p>
                  <button type="button" onClick={forget} className={`${buttonClass} mt-2`}>
                    Start a new conversation
                  </button>
                </div>
              ) : (
                <form onSubmit={send} className="flex items-end gap-2 border-t border-black/10 p-3 dark:border-white/10">
                  <label htmlFor={`${uid}-reply`} className="sr-only">
                    Your message
                  </label>
                  <textarea
                    id={`${uid}-reply`}
                    ref={firstFieldRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    maxLength={MAX_CHARS}
                    placeholder="Write a message…"
                    className={`${fieldClass} resize-none`}
                  />
                  <button type="submit" disabled={sending || !draft.trim()} className={buttonClass}>
                    Send
                  </button>
                </form>
              )}
            </>
          ) : thanks ? (
            <p className="px-4 py-6 text-sm text-gray-700 dark:text-gray-300">Thanks, your message is with the founder.</p>
          ) : (
            <form onSubmit={start} className="space-y-3 overflow-y-auto px-4 py-4">
              <div>
                <label htmlFor={`${uid}-name`} className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-200">
                  Name
                </label>
                <input id={`${uid}-name`} ref={firstFieldRef} name="name" required maxLength={120} autoComplete="name" className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${uid}-email`} className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-200">
                  Email
                </label>
                <input id={`${uid}-email`} name="email" type="email" required maxLength={254} autoComplete="email" className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${uid}-message`} className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-200">
                  Message
                </label>
                <textarea id={`${uid}-message`} name="message" required maxLength={MAX_CHARS} rows={4} className={`${fieldClass} resize-y`} />
              </div>
              {/* Honeypot: off-screen and skipped by keyboard and screen readers; bots fill it. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor={`${uid}-website`}>Company website</label>
                <input id={`${uid}-website`} type="text" name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
              </div>
              <button type="submit" disabled={sending} className={`${buttonClass} w-full`}>
                {sending ? 'Sending…' : 'Start conversation'}
              </button>
              <p className="text-[0.7rem] text-gray-500 dark:text-gray-400">We use your email only to reply if you have left the site.</p>
            </form>
          )}
          {error ? (
            <p role="alert" className="border-t border-black/10 px-4 py-2 text-xs text-red-700 dark:border-white/10 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel('founder_chat_float'))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread ? `Talk to founder (${unread} new ${unread === 1 ? 'reply' : 'replies'})` : 'Talk to founder'}
        className="fixed right-4 bottom-4 z-50 inline-flex h-12 items-center gap-2 bg-teal-500 px-4 font-display text-xs font-bold uppercase tracking-[0.1em] text-black shadow-lg shadow-black/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 sm:right-6 sm:bottom-6"
      >
        <ChatIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{open ? 'Close' : 'Talk to founder'}</span>
        {unread > 0 && !open ? <span aria-hidden="true" className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-white dark:ring-black" /> : null}
      </button>
    </>
  );
}
