import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Email, LegalPage } from '@/components/LegalPage';
import { SITE_CONTACTS } from '@/lib/site-contacts';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/terms';
const TITLE = 'Terms of use';
const STANDFIRST = `The terms that apply when you use ${BRAND}.`;

export const metadata: Metadata = pageMetadata({ title: TITLE, description: STANDFIRST, path: PATH });

export default function TermsPage() {
  const operator = SITE_CONTACTS.legalEntity || BRAND;
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <p>
        These terms apply to your use of this website, operated by {operator} (“we”, “us”). By using the site you agree
        to them. If you do not agree, please do not use the site.
      </p>

      <h2>Using the site</h2>
      <p>
        {BRAND} is free to read. You may read, share links to and quote short extracts from our stories with
        attribution and a link to the original story. You must not use the site in a way that breaks the law, interferes
        with its operation or tries to gain unauthorised access to any part of it.
      </p>

      <h2>Content ownership</h2>
      <p>
        The text of {BRAND} stories, the site design and the {BRAND} name and logo belong to us. Reporting summarised in
        our stories and images credited to other publishers belong to their owners.
      </p>

      <h2>Automated access and reuse</h2>
      <p>
        You must not copy, republish or redistribute our stories in bulk, scrape the site at a rate that burdens it, or
        use our content to build a competing news product, without our written permission. Automated crawlers must follow
        our <a href="/robots.txt">robots.txt</a>. Search engines and AI systems that follow robots.txt may index the site
        and should cite stories as described in our <a href="/llms.txt">llms.txt</a>.
      </p>

      <h2>Email list</h2>
      <p>
        If you join our early-access list, we store your email address and where you signed up, only to tell you when
        the {BRAND} brief launches. To be removed, email <Email address={SITE_CONTACTS.general} />.
      </p>

      <h2>External links</h2>
      <p>
        We link to other websites, including the sources of our stories. We are not responsible for their content. See
        the <Link href="/disclaimer">disclaimer</Link>.
      </p>

      <h2>Liability</h2>
      <p>
        The site and its content are provided “as is”. We work to keep stories accurate but make no guarantee that
        they are complete, current or error-free, and nothing here is professional advice. To the extent the law allows,
        we are not liable for any loss arising from your use of the site or reliance on its content.
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms; the date at the top shows the latest version. These terms are governed by the laws of{' '}
        {SITE_CONTACTS.jurisdiction}.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <Email address={SITE_CONTACTS.general} />.
      </p>
    </LegalPage>
  );
}
