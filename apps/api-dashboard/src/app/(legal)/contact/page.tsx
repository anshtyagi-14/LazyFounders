import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { ContactForm } from '@/components/ContactForm';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { ChatIcon, TalkToFounderButton } from '@/components/TalkToFounderButton';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/contact';
const TITLE = `Contact ${BRAND}`;
const STANDFIRST = `Work with ${BRAND}, or reach us for general enquiries, corrections, partnerships and security reports.`;

export const metadata: Metadata = pageMetadata({ title: 'Contact us', description: STANDFIRST, path: PATH });

export default function ContactPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-27">
      <ContactForm />

      <h2>General enquiries</h2>
      <p>
        Questions, feedback and story tips: <Email address={SITE_CONTACTS.general} />.
      </p>

      <h2>Talk to the founder</h2>
      <p>
        Prefer to chat?{' '}
        <TalkToFounderButton surface="contact_page" className="inline-flex items-center gap-1.5 font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400">
          <ChatIcon className="h-4 w-4" />
          Message the founder directly
        </TalkToFounderButton>
        . Replies appear in the same chat window.
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
