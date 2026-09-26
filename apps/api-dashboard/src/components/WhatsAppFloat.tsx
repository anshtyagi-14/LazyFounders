'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { WhatsAppIcon, whatsAppLinkProps } from './WhatsApp';

/** The internal consoles are not part of the publication. */
const HIDDEN_PREFIXES = ['/admin', '/dashboard'];

/**
 * Floating "chat on WhatsApp" button, rendered once in the root layout so it
 * sits in the bottom-right corner of every public page.
 */
export function WhatsAppFloat() {
  const pathname = usePathname() ?? '';
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;

  return (
    <a
      {...whatsAppLinkProps('whatsapp_float')}
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="fixed right-4 bottom-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] sm:right-6 sm:bottom-6"
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
