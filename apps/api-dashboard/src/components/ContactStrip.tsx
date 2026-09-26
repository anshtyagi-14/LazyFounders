import React from 'react';
import Link from 'next/link';
import { gaAttrs } from '@/lib/ga-attrs';
import { WhatsAppIcon, whatsAppLinkProps } from './WhatsApp';

/**
 * Slim (50px) contact strip placed inline, roughly halfway down each public
 * page. `surface` names the page it sits on for the GA click report.
 */
export function ContactStrip({ surface, className = '' }: { surface: string; className?: string }) {
  return (
    <aside
      aria-label="Contact us"
      className={`not-prose flex h-[50px] items-center gap-3 border border-teal-500/40 bg-teal-50 px-4 dark:bg-teal-950/40 ${className}`}
    >
      <span aria-hidden="true" className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500 sm:block" />
      <p className="m-0 min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
        <span className="font-semibold text-gray-900 dark:text-white">Got a story tip or partnership idea?</span>
        <span className="hidden md:inline"> We read every message.</span>
      </p>
      <a
        {...whatsAppLinkProps('contact_strip')}
        aria-label="Chat with us on WhatsApp"
        className="inline-flex shrink-0 items-center gap-1.5 bg-[#25D366] px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-black! no-underline! transition-colors hover:bg-[#1ebe5a]"
      >
        <WhatsAppIcon className="h-4 w-4" />
        <span className="hidden sm:inline">WhatsApp</span>
      </a>
      <Link
        href="/contact"
        {...gaAttrs('contact_click', { source_surface: 'contact_strip', content_id: surface })}
        className="shrink-0 bg-teal-500 px-4 py-1.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-black! no-underline! transition-colors hover:bg-teal-400"
      >
        Contact us
      </Link>
    </aside>
  );
}

/**
 * Returns `nodes` with a ContactStrip spliced in at the halfway point. Inside
 * a CSS grid the default `col-span-full` makes the strip its own full row.
 */
export function withContactStrip(
  nodes: React.ReactNode[],
  surface: string,
  className = 'col-span-full',
): React.ReactNode[] {
  const mid = Math.ceil(nodes.length / 2);
  return [...nodes.slice(0, mid), <ContactStrip key="contact-strip" surface={surface} className={className} />, ...nodes.slice(mid)];
}
