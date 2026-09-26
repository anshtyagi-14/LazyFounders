'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { gaAttrs } from '@/lib/ga-attrs';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { WhatsAppIcon, whatsAppLinkProps } from './WhatsApp';

/**
 * "Get in touch" strip rendered once in the root layout, just above the footer,
 * so every public page ends with a way to reach the newsroom.
 *
 * Skipped on /contact itself (it would point at the page the reader is on) and
 * on the internal consoles, which are not part of the publication.
 */
const HIDDEN_PREFIXES = ['/contact', '/admin', '/dashboard'];

/** Whether the contact banners belong on this route. */
export function showsContactBanner(pathname: string): boolean {
  return !HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function ContactBanner() {
  const pathname = usePathname() ?? '';
  if (!showsContactBanner(pathname)) return null;

  return (
    <section aria-labelledby="contact-banner-heading" className="border-t border-black/10 dark:border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 border border-teal-500/30 bg-teal-50 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 dark:bg-teal-950/40">
          <div className="max-w-2xl">
            <p className="mb-2 font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-500">
              Contact us
            </p>
            <h2 id="contact-banner-heading" className="font-headline text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl dark:text-white">
              Have a story tip, correction or partnership idea?
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Write to us at{' '}
              <a
                href={`mailto:${SITE_CONTACTS.general}`}
                {...gaAttrs('contact_click', { source_surface: 'contact_banner', content_id: 'email' })}
                className="font-medium text-gray-900 underline decoration-teal-500 underline-offset-2 hover:text-teal-700 dark:text-white dark:hover:text-teal-400"
              >
                {SITE_CONTACTS.general}
              </a>
              {' '}or message us on WhatsApp. We read every message.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <a
              {...whatsAppLinkProps('contact_banner')}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#25D366] px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.08em] text-black transition-colors hover:bg-[#1ebe5a]"
            >
              <WhatsAppIcon className="h-5 w-5" />
              WhatsApp us
            </a>
            <Link
              href="/contact"
              {...gaAttrs('contact_click', { source_surface: 'contact_banner', content_id: 'contact_page' })}
              className="inline-flex min-h-11 shrink-0 items-center justify-center bg-teal-500 px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.08em] text-black transition-colors hover:bg-teal-400"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
