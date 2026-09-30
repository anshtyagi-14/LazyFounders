'use client';

import React, { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

/** The internal consoles are not part of the publication. */
const HIDDEN_PREFIXES = ['/admin', '/dashboard'];

/** The element widget.js mounts on <body>; its shadow root holds the launcher. */
export const MANTIS_HOST = '[data-founder-widget]';

/**
 * "Talk to founder": the hosted Mantis chat widget, mounted once in the root layout.
 * widget.js draws the launcher and the iframed panel itself; messages reach the
 * founder's Mantis inbox labelled with `data-site`, which must never change.
 * It loads from mantisai.in (never proxied or copied) and needs body, hence
 * lazyOnload rather than beforeInteractive.
 */
export function MantisWidget() {
  const pathname = usePathname() ?? '';
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // widget.js has no unmount, so a client-side move into the consoles hides the
  // mounted launcher instead, and a move back shows it again.
  useEffect(() => {
    const host = document.querySelector<HTMLElement>(MANTIS_HOST);
    if (host) host.style.display = hidden ? 'none' : '';
  }, [hidden]);

  if (hidden) return null;
  return <Script src="https://mantisai.in/widget.js" data-site="lazyfounders" strategy="lazyOnload" />;
}
