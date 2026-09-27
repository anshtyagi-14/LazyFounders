'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { reportError, track } from '@/lib/analytics';
import { INQUIRY_TYPES } from '@/lib/lead-options';

type Status = 'idle' | 'submitting' | 'success' | 'error';

function utm(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

const fieldClass =
  'min-h-11 w-full border border-black/15 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-teal-600 focus:outline-none dark:border-white/15 dark:bg-black/40 dark:text-white';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-200';

/**
 * Enquiry form for prospective clients, partners and advertisers. Posts to
 * /api/contact; submissions appear under Leads in the admin console.
 */
export function ContactForm() {
  const id = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  // Set once mounted; the server rejects submissions faster than a person could type.
  const renderedAt = useRef(0);
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);
  const started = useRef(false);

  function onFocus() {
    if (started.current) return;
    started.current = true;
    track('lead_form_start', { source_surface: 'contact_page' });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    const formEl = e.currentTarget;
    if (!formEl.reportValidity()) return;
    const form = new FormData(formEl);
    const field = (name: string) => String(form.get(name) ?? '').trim();

    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: field('name'),
          email: field('email'),
          company: field('company') || undefined,
          phone: field('phone') || undefined,
          inquiryType: field('inquiryType'),
          message: field('message'),
          utmSource: utm('utm_source'),
          utmMedium: utm('utm_medium'),
          utmCampaign: utm('utm_campaign'),
          referrer: document.referrer || undefined,
          company_website: field('company_website'),
          renderedAt: renderedAt.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setStatus('success');
        setMessage(data.message || 'Thanks, we have your message.');
        formEl.reset();
        track('generate_lead', { inquiry_type: field('inquiryType'), source_surface: 'contact_page' });
        return;
      }
      setStatus('error');
      setMessage(data.error || 'Something went wrong. Please try again.');
      const errorType = res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'server' : 'validation';
      track('lead_form_error', { error_type: errorType });
    } catch (err) {
      setStatus('error');
      setMessage('Could not reach the server. Check your connection and try again.');
      track('lead_form_error', { error_type: 'network' });
      reportError('api_error', err instanceof Error ? err.message : 'contact form network error');
    }
  }

  const statusId = `${id}-status`;

  if (status === 'success') {
    return (
      <div className="border border-teal-500/30 bg-teal-500/5 p-6 sm:p-8">
        <p className="font-headline text-2xl font-semibold text-gray-950 dark:text-white">Message sent</p>
        <p id={statusId} role="status" className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-teal-500/30 bg-teal-500/5 p-6 sm:p-8">
      <p className="font-headline text-2xl font-semibold text-gray-950 dark:text-white">Work with us</p>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Advertising, partnerships or content for your startup: tell us what you have in mind and we will reply within two working days.
      </p>
      <form onSubmit={onSubmit} onFocus={onFocus} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            Name <span aria-hidden="true" className="text-teal-700 dark:text-teal-400">*</span>
          </label>
          <input id={`${id}-name`} name="name" required maxLength={120} autoComplete="name" className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={labelClass}>
            Work email <span aria-hidden="true" className="text-teal-700 dark:text-teal-400">*</span>
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.com"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-company`} className={labelClass}>
            Company
          </label>
          <input id={`${id}-company`} name="company" maxLength={160} autoComplete="organization" className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={labelClass}>
            Phone or WhatsApp
          </label>
          <input id={`${id}-phone`} name="phone" type="tel" maxLength={40} autoComplete="tel" inputMode="tel" className={fieldClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-type`} className={labelClass}>
            What is it about? <span aria-hidden="true" className="text-teal-700 dark:text-teal-400">*</span>
          </label>
          <select id={`${id}-type`} name="inquiryType" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Choose one
            </option>
            {INQUIRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-message`} className={labelClass}>
            Message <span aria-hidden="true" className="text-teal-700 dark:text-teal-400">*</span>
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            className={`${fieldClass} resize-y`}
          />
        </div>
        {/* Honeypot: off-screen and skipped by keyboard and screen readers; bots fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor={`${id}-website`}>Company website</label>
          <input id={`${id}-website`} type="text" name="company_website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="min-h-11 bg-teal-500 px-6 font-display text-[0.72rem] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-teal-400 disabled:cursor-wait disabled:opacity-70"
          >
            {status === 'submitting' ? 'Sending…' : 'Send message'}
          </button>
          <p className="text-xs text-gray-600 dark:text-gray-400">We only use these details to reply to you.</p>
        </div>
        {status === 'error' && message ? (
          <p id={statusId} role="alert" className="sm:col-span-2 text-sm text-red-700 dark:text-red-400">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
