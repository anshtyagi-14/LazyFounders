import React from 'react';
import { jsonLdScript } from '@/lib/seo';

/** Renders a schema.org JSON-LD block. Always use this rather than a raw script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
