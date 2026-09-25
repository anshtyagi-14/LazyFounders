import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/articles';
import { CATEGORY_LINKS, FOLLOW_LINKS, TRUST_LINKS } from '@/lib/nav';
import { gaAttrs } from '@/lib/ga-attrs';
import { EmailCapture } from './EmailCapture';
import { Wordmark } from './site/Wordmark';

/**
 * Static footer: the six categories, the trust pages, where to follow, and the
 * early-access form. No database reads, and no long generated link lists.
 */

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-500">{children}</h2>
  );
}

function FooterLink({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, string>) {
  return (
    <Link href={href} {...rest} className="block py-1.5 text-sm text-gray-600 transition-colors hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-400">
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-gray-50 dark:border-white/10 dark:bg-[#0e0e11]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-10 border-b border-black/10 pb-8 dark:border-white/10">
          <Wordmark size="lg" />
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <nav aria-label="Sections">
            <ColumnHeading>Sections</ColumnHeading>
            {CATEGORY_LINKS.map((l) => (
              <FooterLink key={l.href} href={l.href} {...gaAttrs('category_select', { category: l.label, source_surface: 'footer' })}>
                {l.label}
              </FooterLink>
            ))}
          </nav>

          <nav aria-label={`About ${BRAND}`}>
            <ColumnHeading>About</ColumnHeading>
            {TRUST_LINKS.map((l) => (
              <FooterLink key={l.href} href={l.href}>
                {l.label}
              </FooterLink>
            ))}
          </nav>

          <nav aria-label="Follow">
            <ColumnHeading>Follow</ColumnHeading>
            {FOLLOW_LINKS.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...gaAttrs(l.event, { content_id: l.label, source_surface: 'footer' })}
                  className="block py-1.5 text-sm text-gray-600 transition-colors hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-400"
                >
                  {l.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <FooterLink key={l.href} href={l.href} {...gaAttrs(l.event, { source_surface: 'footer' })}>
                  {l.label}
                </FooterLink>
              ),
            )}
          </nav>

          <div>
            <EmailCapture
              location="footer"
              compact
              heading="The daily brief"
              blurb="Startup, funding and AI news in a five-minute read. Join the early-access list."
            />
          </div>
        </div>
      </div>

      {/* The masthead again, at scale: the reader leaves the page knowing whose
          publication they were reading. */}
      <div className="mx-auto max-w-7xl overflow-hidden px-4 sm:px-6 lg:px-8">
        {/* Sized to bleed off the edge, clipped by the wrapper: without the clip
            this single word widens the document and the whole page scrolls sideways. */}
        <p aria-hidden="true" className="select-none whitespace-nowrap border-t border-black/10 pt-10 font-display text-[13vw] font-extrabold uppercase leading-[0.8] tracking-[-0.045em] text-black/5 dark:border-white/10 dark:text-white/8 lg:text-[10.5rem]">
          {BRAND}
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-6 text-xs text-gray-500 dark:border-white/10">
          <p>
            &copy; {new Date().getFullYear()} {BRAND}. All rights reserved.
          </p>
          <p>
            AI-assisted reporting from cited sources. <Link href="/ai-policy" className="underline hover:text-teal-700 dark:hover:text-teal-400">How we use AI</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
