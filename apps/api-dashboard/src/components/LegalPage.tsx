import React from 'react';
import Link from 'next/link';
import { Breadcrumbs } from './Breadcrumbs';
import { JsonLd } from './JsonLd';
import { withContactStrip } from './ContactStrip';
import { TRUST_LINKS } from '@/lib/nav';
import { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl, breadcrumbSchema } from '@/lib/seo';

/**
 * Shared shell for the trust pages (/about, /editorial-policy, ...): one H1,
 * a short standfirst, a last-updated date, readable prose and links to the
 * sibling pages.
 */
export function LegalPage({
  path,
  title,
  standfirst,
  updated,
  children,
}: {
  path: string;
  title: string;
  standfirst: string;
  /** ISO date the policy text last changed. */
  updated: string;
  children: React.ReactNode;
}) {
  // Contact strip goes halfway through the policy text. A page that wraps its
  // body in a fragment is unwrapped first so the split lands between sections.
  let blocks = React.Children.toArray(children);
  if (blocks.length === 1 && React.isValidElement<{ children?: React.ReactNode }>(blocks[0]) && blocks[0].type === React.Fragment) {
    blocks = React.Children.toArray(blocks[0].props.children);
  }
  const body = withContactStrip(blocks, path, '');

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: title, path },
  ];
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(path)}#webpage`,
        url: absoluteUrl(path),
        name: title,
        description: standfirst,
        dateModified: updated,
        isPartOf: { '@id': WEBSITE_ID },
        publisher: { '@id': ORGANIZATION_ID },
        breadcrumb: breadcrumbSchema(crumbs),
      },
    ],
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd data={schema} />
      <Breadcrumbs crumbs={crumbs} className="mb-6" />
      <div className="grid gap-12 lg:grid-cols-[1fr_16rem]">
        <article className="min-w-0 max-w-3xl">
          <h1 className="font-headline text-4xl font-semibold leading-tight text-gray-950 dark:text-white">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">{standfirst}</p>
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
            Last updated{' '}
            <time dateTime={updated}>
              {new Date(updated).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}
            </time>
          </p>
          <div className="legal-prose mt-10 space-y-5 text-[0.97rem] leading-relaxed text-gray-800 dark:text-gray-300 [&_a]:font-medium [&_a]:text-teal-800 [&_a]:underline dark:[&_a]:text-teal-400 [&_h2]:mt-10 [&_h2]:font-headline [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-gray-950 dark:[&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
            {body}
          </div>
        </article>
        <nav aria-label="Policies" className="lg:pt-2">
          <h2 className="mb-3 font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-500">
            Policies
          </h2>
          <ul className="space-y-1">
            {TRUST_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={l.href === path ? 'page' : undefined}
                  className={`block py-1.5 text-sm ${
                    l.href === path
                      ? 'font-semibold text-gray-950 dark:text-white'
                      : 'text-gray-600 hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-400'
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}

/** Email address as visible text plus a mailto link (the text survives where mailto does not). */
export function Email({ address }: { address: string }) {
  return <a href={`mailto:${address}`}>{address}</a>;
}
