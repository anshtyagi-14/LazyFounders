import React from 'react';
import Link from 'next/link';
import { Wordmark } from './Wordmark';
import { SearchBox } from './SearchBox';
import { MobileMenu, NavDropdown } from './HeaderNav';
import { getNavTopics, PRIMARY_LINKS } from '@/lib/nav';
import { COMPANY_GROUPS } from '@/lib/companies';
import { ThemeToggle } from './ThemeToggle';

/**
 * The masthead, rendered once in the root layout.
 *
 * It replaces four copy-pasted `<nav>` stubs that each carried only a wordmark,
 * and it is `sticky` rather than `fixed`, which is what lets every page drop the
 * hand-rolled top offset it used to need to clear the old fixed bar.
 */

function slugifyCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function TopicLinks({ topics, className = '' }: { topics: { slug: string; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      {topics.map((t) => (
        <Link
          key={t.slug}
          href={'/news/category/' + t.slug}
          className="block py-1.5 text-sm text-gray-700 hover:text-teal-700 transition-colors dark:text-gray-300 dark:hover:text-teal-400"
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export async function SiteHeader() {
  const topics = await getNavTopics();

  const companyPanel = (
    <div className="grid w-[46rem] max-w-[80vw] grid-cols-4 gap-x-8 gap-y-1">
      {COMPANY_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal-500">
            {group.title}
          </p>
          {group.items.slice(0, 10).map((name) => (
            <Link
              key={name}
              href={'/company/' + slugifyCompany(name)}
              className="block py-1 text-sm text-gray-700 hover:text-teal-700 transition-colors dark:text-gray-300 dark:hover:text-teal-400"
            >
              {name}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/95 backdrop-blur-md dark:border-white/10 dark:bg-[#08080a]/95">
      <div className="mx-auto flex h-[var(--header-h)] max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <MobileMenu>
          <nav aria-label="Mobile" className="mx-auto max-w-lg space-y-8">
            <div>
              <p className="mb-3 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal-500">Topics</p>
              <TopicLinks topics={topics} className="grid grid-cols-2 gap-x-6" />
            </div>
            <div>
              <p className="mb-3 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal-500">Sections</p>
              {PRIMARY_LINKS.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="block py-1.5 text-sm text-gray-700 hover:text-teal-700 dark:text-gray-300 dark:hover:text-teal-400">
                  {l.label}
                  {l.soon ? <span className="ml-2 text-[0.65rem] uppercase tracking-wider text-gray-600">soon</span> : null}
                </Link>
              ))}
            </div>
            <div>
              <p className="mb-3 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal-500">Companies</p>
              <div className="grid grid-cols-2 gap-x-6">
                {COMPANY_GROUPS.flatMap((g) => g.items.slice(0, 6)).map((name) => (
                  <Link
                    key={name}
                    href={'/company/' + slugifyCompany(name)}
                    className="block py-1.5 text-sm text-gray-700 hover:text-teal-700 dark:text-gray-300 dark:hover:text-teal-400"
                  >
                    {name}
                  </Link>
                ))}
              </div>
            </div>
            <SearchBox />
          </nav>
        </MobileMenu>

        <Wordmark compactOnMobile />

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-7 lg:flex">
          {topics.length > 0 ? (
            <NavDropdown label="Topics" panelClassName="w-[34rem]">
              <p className="mb-3 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-teal-500">
                Browse by topic
              </p>
              <TopicLinks topics={topics} className="grid grid-cols-3 gap-x-8" />
            </NavDropdown>
          ) : null}

          <NavDropdown label="Companies">{companyPanel}</NavDropdown>

          {PRIMARY_LINKS.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              className="py-2 text-sm font-medium text-gray-700 hover:text-teal-700 transition-colors dark:text-gray-300 dark:hover:text-teal-400"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <SearchBox className="hidden w-56 sm:block" />
          <Link
            href="/search"
            aria-label="Search"
            className="block p-2 text-gray-700 hover:text-teal-700 sm:hidden dark:text-gray-300 dark:hover:text-teal-400"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="20" y1="20" x2="16.7" y2="16.7" />
            </svg>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
