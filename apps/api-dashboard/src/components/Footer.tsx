import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/articles';
import { FOOTER_LINKS, SOCIAL_LINKS, getNavTopics } from '@/lib/nav';
import { ALL_COMPANIES } from '@/lib/companies';

/**
 * The footer used to run its own `findMany({ take: 2000 })` for company names on
 * every render of every page - a third database round trip per request, under
 * `force-dynamic`. It now reads the curated directory and the memoised topic
 * list, so it costs nothing beyond what the masthead already fetched.
 *
 * The company list is capped: linking a hundred company pages from every page of
 * the site is a link farm into pages that are frequently empty.
 */

function slugifyCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-4 font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-500">{children}</h3>
  );
}

function FooterLink({ href, children, soon }: { href: string; children: React.ReactNode; soon?: boolean }) {
  return (
    <Link href={href} className="block py-1 text-sm text-gray-400 transition-colors hover:text-teal-400">
      {children}
      {soon ? <span className="ml-1.5 text-[0.6rem] uppercase tracking-wider text-gray-600">soon</span> : null}
    </Link>
  );
}

export async function Footer() {
  const topics = await getNavTopics();
  const companies = ALL_COMPANIES.slice(0, 24);

  return (
    <footer className="border-t border-white/10 bg-[#0e0e11]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {topics.length > 0 ? (
            <div>
              <ColumnHeading>Topics</ColumnHeading>
              {topics.slice(0, 10).map((t) => (
                <FooterLink key={t.slug} href={'/news/category/' + t.slug}>
                  {t.label}
                </FooterLink>
              ))}
            </div>
          ) : null}

          <div>
            <ColumnHeading>Companies</ColumnHeading>
            <div className="grid grid-cols-2 gap-x-5 md:grid-cols-1">
              {companies.slice(0, 10).map((name) => (
                <FooterLink key={name} href={'/company/' + slugifyCompany(name)}>
                  {name}
                </FooterLink>
              ))}
            </div>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <ColumnHeading>{group.title}</ColumnHeading>
              {group.items.map((item) => (
                <FooterLink key={item.label} href={item.href} soon={item.soon}>
                  {item.label}
                </FooterLink>
              ))}
            </div>
          ))}

          <div>
            <ColumnHeading>The daily brief</ColumnHeading>
            <p className="mb-4 text-sm leading-relaxed text-gray-400">
              Startup, funding and AI news in a five-minute read.
            </p>
            {/* An honest link, not an input. There is no subscriber table in the
                schema yet, so a form here would discard what the reader types. */}
            <Link
              href="/coming-soon"
              className="inline-flex items-center gap-2 border border-teal-500/40 px-4 py-2 font-display text-[0.7rem] font-bold uppercase tracking-[0.12em] text-teal-400 transition-colors hover:bg-teal-500 hover:text-black"
            >
              Get the brief
              <span aria-hidden="true">-&gt;</span>
            </Link>

            <ColumnHeading>
              <span className="mt-8 block">Follow</span>
            </ColumnHeading>
            <div className="flex gap-4">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 transition-colors hover:text-teal-400"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The masthead again, at scale: the reader leaves the page knowing whose
          publication they were reading. */}
      <div className="mx-auto max-w-7xl overflow-hidden px-4 sm:px-6 lg:px-8">
        {/* Sized to bleed off the edge, clipped by the wrapper: without the clip
            this single word widens the document and the whole page scrolls sideways. */}
        <p className="select-none whitespace-nowrap border-t border-white/10 pt-10 font-display text-[13vw] font-extrabold uppercase leading-[0.8] tracking-[-0.045em] text-white/8 lg:text-[10.5rem]">
          {BRAND}
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-gray-500">
          <p>
            &copy; {new Date().getFullYear()} {BRAND}. All rights reserved.
          </p>
          <p>AI-assisted reporting, human-reviewed, fully cited.</p>
        </div>
      </div>
    </footer>
  );
}

