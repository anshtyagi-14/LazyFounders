import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/corrections';
const TITLE = 'Corrections';
const STANDFIRST = `How to report an error in a ${BRAND} story, and how we correct it.`;

export const metadata: Metadata = pageMetadata({ title: TITLE, description: STANDFIRST, path: PATH });

export default function CorrectionsPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <h2>Report an error</h2>
      <p>
        Email <Email address={SITE_CONTACTS.editorial} /> with:
      </p>
      <ul>
        <li>the link to the story;</li>
        <li>what is wrong, and what is correct;</li>
        <li>a source for the correct information, if you have one.</li>
      </ul>
      <p>
        The same address handles attribution problems and requests from publishers about how their reporting or images
        are used.
      </p>

      <h2>What we do</h2>
      <ul>
        <li>
          <strong>Factual errors</strong> — wrong amounts, names, dates or claims — are corrected in the story, and a
          note at the end says what was changed and when.
        </li>
        <li>
          <strong>Minor fixes</strong> — spelling, formatting, a broken link — are made without a note.
        </li>
        <li>
          <strong>Serious errors</strong> — where the story’s central claim is wrong — may lead to the story being
          withdrawn, with a note explaining why.
        </li>
        <li>
          <strong>Source errors</strong> — if a source itself corrects its reporting, we update our story to match.
        </li>
      </ul>
      <p>
        We aim to review every report within two working days. A story’s “Updated” date shows when it last changed
        after publication.
      </p>

      <h2>Standards</h2>
      <p>
        Corrections follow our <Link href="/editorial-policy">editorial policy</Link>. How AI is involved in drafting
        stories, and its limits, is described in the <Link href="/ai-policy">AI policy</Link>.
      </p>
    </LegalPage>
  );
}
