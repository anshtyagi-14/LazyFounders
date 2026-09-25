import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/editorial-policy';
const TITLE = 'Editorial policy';
const STANDFIRST = `How ${BRAND} chooses its sources, checks what it publishes, separates fact from analysis and handles corrections.`;

export const metadata: Metadata = pageMetadata({ title: TITLE, description: STANDFIRST, path: PATH });

export default function EditorialPolicyPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <h2>Source selection</h2>
      <p>
        We only build stories from publishers in our source registry. A publisher is added only after we have reviewed
        it: that it publishes original reporting, that its robots.txt and terms allow us to read it, and that its pages
        can be attributed reliably. A source can be paused or removed at any time, and one that repeatedly fails or
        misbehaves is taken out of rotation automatically.
      </p>
      <p>We do not bypass paywalls, logins or bot protection. Paywalled stories are not used.</p>

      <h2>How facts are checked</h2>
      <p>
        Each story is drafted from facts extracted from its sources. Before a story can be published, automated
        validation checks that:
      </p>
      <ul>
        <li>every number, amount, date and name in the story appears in the cited source material;</li>
        <li>the story is written in its own words, not copied from a source;</li>
        <li>every source that contributed facts is listed and linked;</li>
        <li>machine-translated quotes are presented as reported speech, not as verbatim quotations.</li>
      </ul>
      <p>
        A story that fails these checks is held back for an editor instead of being published. Our{' '}
        <Link href="/ai-policy">AI policy</Link> explains where AI is involved and its limits.
      </p>

      <h2>Fact and analysis</h2>
      <p>
        News stories report what the sources establish. Where a story adds context or interpretation — why a deal
        matters, what it means for a market — that section is labelled as analysis and is {BRAND}’s view, not a
        source’s.
      </p>

      <h2>Attribution</h2>
      <p>
        Every story ends with a numbered list of its sources, naming the publisher and linking to the original article.
        Headlines shown under “From the wire” are the publisher’s own reporting; they credit and link to the publisher
        and are not presented as {BRAND} stories.
      </p>

      <h2>Sponsored content</h2>
      <p>
        News coverage is never paid for. Any sponsored material is labelled “Sponsor” and kept visually separate from
        stories. Advertisers and partners have no say over what we report.
      </p>

      <h2>Content types</h2>
      <ul>
        <li>
          <strong>Story</strong> — an original {BRAND} article synthesised from multiple cited sources.
        </li>
        <li>
          <strong>From the wire</strong> — a headline and summary from a single approved publisher, linking to their
          original.
        </li>
        <li>
          <strong>Analysis</strong> — clearly marked passages of context or interpretation within a story.
        </li>
        <li>
          <strong>Sponsored</strong> — paid material, always labelled.
        </li>
      </ul>

      <h2>Corrections</h2>
      <p>
        We correct errors promptly and say so on the story. See the <Link href="/corrections">corrections policy</Link>{' '}
        or write to <Email address={SITE_CONTACTS.editorial} />.
      </p>
    </LegalPage>
  );
}
