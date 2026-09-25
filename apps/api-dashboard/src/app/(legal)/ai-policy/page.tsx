import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/ai-policy';
const TITLE = 'AI policy';
const STANDFIRST = `${BRAND} uses AI to find, draft and check stories. This page explains exactly where, how sources are shown, and what AI gets wrong.`;

export const metadata: Metadata = pageMetadata({ title: TITLE, description: STANDFIRST, path: PATH });

export default function AiPolicyPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <h2>Where AI is used</h2>
      <ul>
        <li>
          <strong>Discovery.</strong> Software monitors our approved publishers for new stories and groups reports that
          describe the same event, so one event becomes one story.
        </li>
        <li>
          <strong>Translation.</strong> When a source is not in English, AI translates the extracted facts. Names,
          amounts and dates are checked against the original.
        </li>
        <li>
          <strong>Drafting.</strong> An AI model writes the story from the facts extracted from its sources, in our house
          format.
        </li>
        <li>
          <strong>Categorisation.</strong> AI assigns each story to a section and tags the companies it mentions.
        </li>
      </ul>

      <h2>How publishing works</h2>
      <p>
        Every draft goes through automated validation before it can be published: the facts in it must be traceable to
        the source material, it must be original writing, and every source must be attributed. Drafts that pass every
        check can be published automatically; drafts that fail any check are held for an editor. We do not claim that an
        individual story was reviewed by a person unless it says so.
      </p>
      <p>
        Stories carry the byline of our editor, <Link href="/author/tarun-mottlia">Tarun Mottlia</Link>, who is
        responsible for the publication and its corrections. The byline does not mean the story was written or reviewed
        by hand; the AI-assisted label on each story still applies.
      </p>

      <h2>How sources are shown</h2>
      <p>
        Every AI-drafted story is labelled as AI-assisted at the top and lists its sources at the end, with the
        publisher’s name and a link to the original article. Images come from the source publisher and are credited to
        them.
      </p>

      <h2>Limits of AI</h2>
      <p>AI models make mistakes, and automated checks do not catch all of them. In particular, a story can:</p>
      <ul>
        <li>inherit an error from its source;</li>
        <li>miss context that a specialist would add;</li>
        <li>lose nuance in translation;</li>
        <li>describe a fast-moving story in a way that later reporting changes.</li>
      </ul>
      <p>
        For anything you intend to act on — an investment, a legal or business decision — read the original sources
        linked in the story. Nothing on {BRAND} is financial, legal or investment advice; see the{' '}
        <Link href="/disclaimer">disclaimer</Link>.
      </p>

      <h2>Found a mistake?</h2>
      <p>
        Write to <Email address={SITE_CONTACTS.editorial} /> with the link to the story. The{' '}
        <Link href="/corrections">corrections policy</Link> explains how we handle it.
      </p>
    </LegalPage>
  );
}
