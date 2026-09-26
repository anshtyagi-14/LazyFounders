import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { EmailCapture } from '@/components/EmailCapture';
import { JsonLd } from '@/components/JsonLd';
import { Email } from '@/components/LegalPage';
import { ContactStrip } from '@/components/ContactStrip';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { SOCIAL_PROFILE_LIST } from '@/lib/social';
import { SITE_CATEGORIES } from '@/lib/topics';
import { BRAND, ORGANIZATION_ID, WEBSITE_ID, absoluteUrl, breadcrumbSchema, pageMetadata, personId } from '@/lib/seo';

/**
 * /about: the story page rather than a policy page. It opens with why the
 * publication exists, then shows exactly how a story is made, who stands
 * behind it and how to reach us. Static: no database reads, like the rest of
 * the trust pages.
 */

const PATH = '/about';
const TITLE = `About ${BRAND}`;
const UPDATED = '2026-09-26';
const STANDFIRST = `${BRAND} is a news publication for founders, operators and investors: startups, funding, AI, policy and technology from sources around the world, in stories you can finish between meetings.`;

const EDITOR = {
  slug: 'tarun-mottlia',
  name: 'Tarun Mottlia',
  photo: '/authors/tarun-mottlia.jpg',
  linkedin: 'https://www.linkedin.com/in/tarunmottlia/',
};

const CRUMBS = [
  { name: 'Home', path: '/' },
  { name: TITLE, path: PATH },
];

export const metadata: Metadata = pageMetadata({ title: 'About us', description: STANDFIRST, path: PATH });

/** The newsroom pipeline, in the order a story moves through it. */
const PIPELINE = [
  {
    step: 'Monitor',
    body: 'We watch a registry of publishers we have reviewed and approved. We respect robots.txt and never bypass paywalls, logins or bot protection.',
  },
  {
    step: 'Cluster',
    body: 'Reports about the same event are grouped, so one funding round or launch becomes one story, not five near-duplicates.',
  },
  {
    step: 'Extract',
    body: 'The facts are pulled out of the sources: who, what, how much, when, and who said it.',
  },
  {
    step: 'Draft',
    body: 'AI writes an original story from those facts, in plain language, with the context a founder needs to act on it.',
  },
  {
    step: 'Validate',
    body: 'Automated checks run before anything goes live. A draft that fails is held back for an editor, not published.',
  },
  {
    step: 'Publish',
    body: 'The story goes live with a numbered list of every source it was built from, each one linked to the original.',
  },
];

const CHECKS = [
  'Every number, amount, date and name in the story appears in the cited sources.',
  'The story is written in its own words, not copied from a source.',
  'Every source that contributed a fact is listed and linked.',
  'Machine-translated quotes are shown as reported speech, never as verbatim quotations.',
];

const READERS = [
  { who: 'Founders', why: 'who need to know who raised, who shipped and who got regulated, before the next investor call.' },
  { who: 'Operators', why: 'who build go-to-market, product and hiring plans on what the market is doing this week.' },
  { who: 'Investors', why: 'who track rounds, valuations and sectors without reading forty tabs to find them.' },
  { who: 'The about-to-start', why: 'students, engineers and side-project builders learning how companies actually get built.' },
];

const PROMISES = [
  { title: 'Sourced, always', body: 'No story without its sources. If we cannot show where a fact came from, it does not run.' },
  { title: 'Short on purpose', body: 'What happened, who was involved, why it matters. Your time is the scarcest thing you have.' },
  { title: 'Free to read', body: 'No paywall, no registration wall. Good information should not depend on a subscription.' },
  { title: 'Honest about AI', body: 'We say plainly where AI is used and where it is not. You should never have to guess.' },
  { title: 'Never paid for', body: 'Coverage cannot be bought. Anything sponsored is labelled and kept apart from the news.' },
  { title: 'Quick to correct', body: 'When we get it wrong, we fix it and say so on the story.' },
];

function schema() {
  const url = absoluteUrl(PATH);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${url}#webpage`,
        url,
        name: TITLE,
        description: STANDFIRST,
        dateModified: UPDATED,
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORGANIZATION_ID },
        publisher: { '@id': ORGANIZATION_ID },
        mentions: { '@id': personId(EDITOR.slug) },
        breadcrumb: breadcrumbSchema(CRUMBS),
      },
    ],
  };
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[0.68rem] font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-500">{children}</p>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-headline text-3xl font-semibold leading-tight text-gray-950 sm:text-4xl dark:text-white">{title}</h2>
      {children ? <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">{children}</p> : null}
    </div>
  );
}

const PROSE =
  'space-y-5 text-[1.05rem] leading-relaxed text-gray-800 dark:text-gray-300 [&_a]:font-medium [&_a]:text-teal-800 [&_a]:underline dark:[&_a]:text-teal-400';

export default function AboutPage() {
  const linkedin = SOCIAL_PROFILE_LIST.find((p) => p.label === 'LinkedIn');

  return (
    <main>
      <JsonLd data={schema()} />

      {/* Hero */}
      <section className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24">
          <Breadcrumbs crumbs={CRUMBS} className="mb-10" />
          <Eyebrow>{TITLE}</Eyebrow>
          <h1 className="mt-4 max-w-4xl font-headline text-4xl font-semibold leading-[1.08] text-gray-950 sm:text-6xl dark:text-white">
            The news you would read if you had the time.{' '}
            <span className="text-teal-600 dark:text-teal-400">Written for the people who don’t.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 dark:text-gray-400">{STANDFIRST}</p>
          <p className="mt-6 text-xs text-gray-600 dark:text-gray-400">
            Last updated{' '}
            <time dateTime={UPDATED}>
              {new Date(UPDATED).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}
            </time>
          </p>
        </div>
      </section>

      {/* Why we exist */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeading eyebrow="Why we started" title="Building a company is lonely. Keeping up shouldn’t be." />
          <div className={PROSE}>
            <p>
              It is 11pm. The product is half-shipped, payroll is next week, and somewhere in forty open tabs is the one
              story that matters: the competitor that just raised, the rule that changes your pricing, the model launch
              that makes your roadmap obsolete — or suddenly possible.
            </p>
            <p>
              Founders do not lack information. They lack the hours to sort it. The news is scattered across dozens of
              publishers, repeated five times over, buried under hot takes, and written for readers who have all day.
            </p>
            <p>
              We started {BRAND} to do that sorting for you. The name is a joke with a point: the smartest founders are
              lazy about the right things. They refuse to waste effort on what a system can do, so they can spend it on
              what only they can. Reading the whole internet every morning is not the job. Building is.
            </p>
            <blockquote className="border-l-4 border-teal-500 pl-5 font-headline text-2xl leading-snug text-gray-950 dark:text-white">
              Our job is to hand you back the hour you would have spent reading the news, and still leave you better
              informed than if you had.
            </blockquote>
          </div>
        </div>
      </section>

      {/* What we cover */}
      <section className="border-y border-black/10 bg-gray-50 dark:border-white/10 dark:bg-[#0e0e11]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <SectionHeading eyebrow="What we cover" title="Six sections. Everything a builder needs, nothing they don’t.">
            Funding rounds and acquisitions, AI models and the companies built on them, regulation, new products, and the
            technology and business news around them — organised into six sections.
          </SectionHeading>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/10 dark:bg-white/10">
            {SITE_CATEGORIES.map((c, i) => (
              <li key={c.slug} className="bg-white dark:bg-[#09090b]">
                <Link
                  href={`/news/category/${c.slug}`}
                  className="group flex h-full flex-col p-6 transition-colors hover:bg-teal-50 dark:hover:bg-teal-950/40"
                >
                  <span className="font-display text-xs font-bold tabular-nums text-teal-700 dark:text-teal-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="mt-3 font-headline text-2xl font-semibold text-gray-950 dark:text-white">{c.label}</span>
                  <span className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{c.blurb}</span>
                  <span className="mt-4 text-sm font-medium text-teal-700 group-hover:underline dark:text-teal-400">
                    Read {c.label} <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How a story is made */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading eyebrow="How a story is made" title="An automated newsroom, with its workings on show.">
          {BRAND} is built by engineers as much as editors. Every story moves through the same six-stage pipeline, and
          nothing skips a stage.
        </SectionHeading>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <li key={p.step} className="relative rounded-2xl border border-black/10 p-6 dark:border-white/10">
              <span className="flex size-10 items-center justify-center rounded-full bg-gray-950 font-display text-sm font-bold text-teal-400 dark:bg-white dark:text-teal-700">
                {i + 1}
              </span>
              <h3 className="mt-4 font-headline text-xl font-semibold text-gray-950 dark:text-white">{p.step}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{p.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-8 rounded-2xl bg-gray-950 p-8 text-gray-300 sm:p-10 lg:grid-cols-[1fr_1.3fr] dark:bg-[#18181b]">
          <div>
            <Eyebrow>Before anything goes live</Eyebrow>
            <h3 className="mt-3 font-headline text-2xl font-semibold text-white">What the validator checks</h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              AI is fast, but it can be confidently wrong. So we never take its word for it. Every draft is checked
              against its own sources, and one that fails is held for a human.
            </p>
          </div>
          <ul className="space-y-4">
            {CHECKS.map((c) => (
              <li key={c} className="flex gap-3 text-[0.97rem] leading-relaxed">
                <span aria-hidden="true" className="mt-1 text-teal-400">✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Alongside our own stories, “From the wire” shows headlines from approved publishers. Those are their reporting,
          credited and linked to the original, not {BRAND} stories. The full rules are in our{' '}
          <Link href="/editorial-policy" className="font-medium text-teal-800 underline dark:text-teal-400">
            editorial policy
          </Link>{' '}
          and{' '}
          <Link href="/ai-policy" className="font-medium text-teal-800 underline dark:text-teal-400">
            AI policy
          </Link>
          .
        </p>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <ContactStrip surface="/about" />
      </div>

      {/* Who it's for */}
      <section className="border-y border-black/10 bg-gray-50 dark:border-white/10 dark:bg-[#0e0e11]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <SectionHeading eyebrow="Who it is for" title="For everyone building something from nothing." />
          <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {READERS.map((r) => (
              <div key={r.who} className="border-t-2 border-teal-500 pt-4">
                <dt className="font-headline text-xl font-semibold text-gray-950 dark:text-white">{r.who}</dt>
                <dd className="mt-2 leading-relaxed text-gray-600 dark:text-gray-400">…{r.why}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Promises */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading eyebrow="What we promise you" title="Trust is the whole product.">
          A news source is only worth reading if you can rely on it. These are the lines we hold.
        </SectionHeading>
        <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {PROMISES.map((p) => (
            <li key={p.title}>
              <h3 className="font-headline text-lg font-semibold text-gray-950 dark:text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* The editor */}
      <section className="border-y border-black/10 bg-gray-50 dark:border-white/10 dark:bg-[#0e0e11]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-[14rem_1fr] lg:px-8 lg:py-24">
          <Image
            src={EDITOR.photo}
            alt={EDITOR.name}
            width={448}
            height={448}
            className="size-48 rounded-2xl object-cover grayscale md:size-56"
          />
          <div className="max-w-2xl">
            <Eyebrow>Who stands behind it</Eyebrow>
            <h2 className="mt-3 font-headline text-3xl font-semibold text-gray-950 dark:text-white">{EDITOR.name}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Editor, {BRAND}</p>
            <div className={`mt-5 ${PROSE}`}>
              <p>
                {BRAND} is edited by {EDITOR.name}, whose byline appears on every {BRAND} story. A byline names the
                editor responsible for the story; it does not mean the story was written without AI. It means a person
                answers for it.
              </p>
              <p>
                {SITE_CONTACTS.legalEntity
                  ? `${BRAND} is operated by ${SITE_CONTACTS.legalEntity}, ${SITE_CONTACTS.jurisdiction}.`
                  : `${BRAND} is an independent publication based in ${SITE_CONTACTS.jurisdiction}.`}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link
                href={`/author/${EDITOR.slug}`}
                className="rounded-full bg-gray-950 px-4 py-2 font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                Stories edited by {EDITOR.name.split(' ')[0]}
              </Link>
              <a
                href={EDITOR.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-black/15 px-4 py-2 font-medium text-gray-800 hover:border-teal-500 dark:border-white/20 dark:text-gray-200"
              >
                LinkedIn<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <Link
                href="/authors"
                className="rounded-full border border-black/15 px-4 py-2 font-medium text-gray-800 hover:border-teal-500 dark:border-white/20 dark:text-gray-200"
              >
                All authors
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-headline text-3xl font-semibold leading-tight text-gray-950 sm:text-4xl dark:text-white">
              You build the company.
              <br />
              <span className="text-teal-600 dark:text-teal-400">We’ll keep you up to speed.</span>
            </h2>
            <div className={`mt-6 ${PROSE}`}>
              <p>
                Spotted an error, have a story we should cover, or want to partner with us? Write to{' '}
                <Email address={SITE_CONTACTS.general} />. Corrections go to <Email address={SITE_CONTACTS.editorial} />{' '}
                and are handled under our <Link href="/corrections">corrections policy</Link>. More ways to reach us are
                on the <Link href="/contact">contact page</Link>.
              </p>
              {linkedin ? (
                <p>
                  Follow along on <a href={linkedin.href} target="_blank" rel="noopener noreferrer">LinkedIn</a>.
                </p>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-black/10 p-6 sm:p-8 dark:border-white/10">
            <EmailCapture
              location="about"
              heading="The daily brief"
              blurb="Startup, funding and AI news in a five-minute read. Join the early-access list."
            />
          </div>
        </div>
      </section>
    </main>
  );
}
