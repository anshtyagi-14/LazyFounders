import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/contact';
const TITLE = `Contact ${BRAND}`;
const STANDFIRST = `How to reach ${BRAND} for general enquiries, corrections, partnerships and security reports.`;

export const metadata: Metadata = pageMetadata({ title: 'Contact us', description: STANDFIRST, path: PATH });

export default function ContactPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <h2>General enquiries</h2>
      <p>
        Questions, feedback and story tips: <Email address={SITE_CONTACTS.general} />.
      </p>

      <h2>Corrections and editorial</h2>
      <p>
        If a story contains an error, misattributes a source or uses material it should not, write to{' '}
        <Email address={SITE_CONTACTS.editorial} />. Include the link to the story and what is wrong. Our{' '}
        <Link href="/corrections">corrections policy</Link> explains what happens next.
      </p>

      <h2>Partnerships and advertising</h2>
      <p>
        <Email address={SITE_CONTACTS.commercial} />. Commercial arrangements never change what we report; see our{' '}
        <Link href="/editorial-policy">editorial policy</Link>.
      </p>

      <h2>Security</h2>
      <p>
        To report a vulnerability in this website, write to <Email address={SITE_CONTACTS.security} />. Our{' '}
        <a href="/.well-known/security.txt">security.txt</a> has the same details.
      </p>
    </LegalPage>
  );
}
