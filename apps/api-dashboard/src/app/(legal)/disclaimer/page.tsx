import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { BRAND, pageMetadata } from '@/lib/seo';

const PATH = '/disclaimer';
const TITLE = 'Disclaimer';
const STANDFIRST = `${BRAND} publishes news for information only. It is not financial, legal or investment advice.`;

export const metadata: Metadata = pageMetadata({ title: TITLE, description: STANDFIRST, path: PATH });

export default function DisclaimerPage() {
  return (
    <LegalPage path={PATH} title={TITLE} standfirst={STANDFIRST} updated="2026-09-25">
      <h2>Information only</h2>
      <p>
        Everything on {BRAND} is general news and commentary. It is provided for information, and it may be incomplete
        or out of date by the time you read it.
      </p>

      <h2>Not advice</h2>
      <p>
        Nothing on this site is financial, investment, legal, tax or other professional advice, or a recommendation to
        buy, sell or hold any security or to invest in any company. Reports of funding rounds, valuations and company
        performance describe what was reported; they are not an assessment of any investment. Take advice from a
        qualified professional before making a decision.
      </p>

      <h2>AI-assisted content</h2>
      <p>
        Our stories are drafted with AI from cited sources and checked by automated validation, which does not catch
        every error. See the <Link href="/ai-policy">AI policy</Link>. Where accuracy matters, rely on the original
        sources linked in each story.
      </p>

      <h2>Third-party content and images</h2>
      <p>
        Stories summarise and link to reporting by other publishers, and images are shown with credit to the
        publisher that supplied them. That material belongs to its owners, who are responsible for it. If you own
        material shown here and want it credited differently or removed, see the{' '}
        <Link href="/corrections">corrections page</Link>.
      </p>

      <h2>External links</h2>
      <p>
        Links to other websites are provided for reference. We do not control those sites and are not responsible for
        their content, availability or privacy practices.
      </p>
    </LegalPage>
  );
}
