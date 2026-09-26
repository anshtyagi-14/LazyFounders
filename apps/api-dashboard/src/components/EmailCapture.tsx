'use client';

import React, { useId, useRef, useState } from 'react';
import { reportError, track } from '@/lib/analytics';

type Location = 'homepage' | 'footer' | 'article' | 'about';
type Status = 'idle' | 'submitting' | 'success' | 'error';

const DEFAULT_SUCCESS =
  'You’re on the early-access list. We’ll let you know when the LazyFounder Brief launches.';

function utm(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Early-access email capture. Stores the address through /api/subscribe and
 * nothing else: no newsletter is sent yet and no account is created.
 */
export function EmailCapture({
  location,
  heading = 'Get the LazyFounder Brief',
  blurb = 'Startup, funding and AI news in a five-minute read. Join the early-access list.',
  compact = false,
}: {
  location: Location;
  heading?: string;
  blurb?: string;
  compact?: boolean;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  // Set on first render; the server rejects submissions faster than a person could type.
  const renderedAt = useRef(Date.now());
  const started = useRef(false);

  function onFocus() {
    if (started.current) return;
    started.current = true;
    track('email_signup_start', { signup_location: location });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    const form = new FormData(e.currentTarget);
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      track('email_signup_error', { signup_location: location, error_type: 'validation' });
      return;
    }

    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          location,
          utmSource: utm('utm_source'),
          utmMedium: utm('utm_medium'),
          utmCampaign: utm('utm_campaign'),
          referrer: document.referrer || undefined,
          company_website: String(form.get('company_website') ?? ''),
          renderedAt: renderedAt.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setStatus('success');
        setMessage(data.message || DEFAULT_SUCCESS);
        setEmail('');
        track('sign_up', { method: 'email_waitlist', signup_location: location });
        return;
      }
      setStatus('error');
      setMessage(data.error || 'Something went wrong. Please try again.');
      const errorType = res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'server' : 'validation';
      track('email_signup_error', { signup_location: location, error_type: errorType });
      if (res.status >= 500) track('api_error', { error_type: 'subscribe_5xx', source_surface: location });
    } catch (err) {
      setStatus('error');
      setMessage('Could not reach the server. Check your connection and try again.');
      track('email_signup_error', { signup_location: location, error_type: 'network' });
      track('api_error', { error_type: 'subscribe_network', source_surface: location });
      reportError('email_capture', err instanceof Error ? err.message : 'network error');
    }
  }

  const inputId = `${id}-email`;
  const statusId = `${id}-status`;

  return (
    <section aria-labelledby={`${id}-heading`} className={compact ? '' : 'border border-teal-500/30 bg-teal-500/5 p-6 sm:p-8'}>
      <h2
        id={`${id}-heading`}
        className={compact
          ? 'mb-2 font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-500'
          : 'font-headline text-2xl font-semibold text-gray-950 dark:text-white'}
      >
        {heading}
      </h2>
      <p className={`${compact ? 'mb-3' : 'mt-2 mb-5'} text-sm leading-relaxed text-gray-600 dark:text-gray-400`}>{blurb}</p>

      {status === 'success' ? (
        <p id={statusId} role="status" className="text-sm font-medium text-teal-800 dark:text-teal-300">
          {message}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className={`flex flex-col gap-2 ${compact ? '' : 'sm:flex-row'}`}>
          <label htmlFor={inputId} className="sr-only">
            Email address
          </label>
          <input
            id={inputId}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={onFocus}
            aria-invalid={status === 'error' ? true : undefined}
            aria-describedby={message ? statusId : undefined}
            className="min-h-11 w-full flex-1 border border-black/15 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-teal-600 dark:border-white/15 dark:bg-black/40 dark:text-white"
          />
          {/* Honeypot: off-screen and skipped by keyboard and screen readers; bots fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor={`${id}-website`}>Company website</label>
            <input id={`${id}-website`} type="text" name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="min-h-11 bg-teal-500 px-5 font-display text-[0.72rem] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-teal-400 disabled:cursor-wait disabled:opacity-70"
          >
            {status === 'submitting' ? 'Joining…' : 'Join the list'}
          </button>
        </form>
      )}
      {status === 'error' && message ? (
        <p id={statusId} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      ) : null}
    </section>
  );
}
