import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/about';
const TITLE = `About ${BRAND}`;
const STANDFIRST = `${BRAND} is a news publication for founders, operators and investors, covering startups, funding, AI, policy and technology from sources around the world.`;

export const metadata: Metadata = pageMetadata({ title: 'About us', description: STANDFIRST, path: PATH });

export default function AboutPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <h2>What we publish</h2>
      <p>
        {BRAND} tracks the stories that matter to people building and backing companies: funding rounds and acquisitions,
        AI models and the companies built on them, regulation and policy, new products, and the technology and business
        news around them. Coverage is organised into six sections — Funding, AI, Policy, Technology, Business and Product.
      </p>

      <h2>Who it is for</h2>
      <p>
        Founders, startup operators, investors and anyone who wants the startup and technology news without the noise:
        short, sourced stories that say what happened, who was involved and why it matters.
      </p>

      <h2>How stories are made</h2>
      <p>
        Our stories are produced by an automated newsroom pipeline. It monitors a registry of publishers we have reviewed
        and approved, groups reports about the same event, extracts the facts from them, and uses AI to draft an original
        story from those facts. Every draft is checked by automated validation — that the numbers, names and dates it
        contains appear in the sources, that it is not copied from them, and that every source is attributed — before it
        can be published. Every story links to the reporting it was built from.
      </p>
      <p>
        The details are in our <Link href="/editorial-policy">editorial policy</Link> and our{' '}
        <Link href="/ai-policy">AI policy</Link>.
      </p>

      <h2>Source stories</h2>
      <p>
        Alongside our own stories, the site shows headlines from our approved publishers under “From the wire”. Those are
        the publisher’s reporting, credited to them and linked to the original; they are not written by {BRAND}.
      </p>

      <h2>Who runs {BRAND}</h2>
      <p>
        {SITE_CONTACTS.legalEntity
          ? `${BRAND} is operated by ${SITE_CONTACTS.legalEntity}, ${SITE_CONTACTS.jurisdiction}.`
          : `${BRAND} is an independent publication based in ${SITE_CONTACTS.jurisdiction}.`}{' '}
        It is free to read, with no paywall or registration.
      </p>

      <h2>Contact</h2>
      <p>
        General enquiries: <Email address={SITE_CONTACTS.general} />. To report an error, write to{' '}
        <Email address={SITE_CONTACTS.editorial} /> or see our <Link href="/corrections">corrections policy</Link>. More
        ways to reach us are on the <Link href="/contact">contact page</Link>.
      </p>
    </LegalPage>
  );
}
