'use client';

import React from 'react';
import { track } from '@/lib/analytics';
import { MANTIS_HOST } from './MantisWidget';

const WAIT_MS = 5000;
const STEP_MS = 200;

/**
 * Opens the Mantis panel by pressing its own launcher: widget.js has no JS API, but its
 * shadow root is open. The script loads lazily, so an early click waits for it to mount.
 */
export function openFounderChat(surface: string): void {
  track('founder_chat_open', { source_surface: surface });
  const started = Date.now();
  const tryOpen = () => {
    const launcher = document.querySelector(MANTIS_HOST)?.shadowRoot?.querySelector<HTMLButtonElement>('button.btn');
    if (launcher) {
      // The launcher hides while the panel is open; pressing it then would close the panel.
      if (launcher.getClientRects().length > 0) launcher.click();
    } else if (Date.now() - started < WAIT_MS) {
      window.setTimeout(tryOpen, STEP_MS);
    }
  };
  tryOpen();
}

export function ChatIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
    </svg>
  );
}

/**
 * A "Talk to founder" button for server-rendered surfaces (contact banner, strip, contact
 * page): it opens the Mantis chat widget that the root layout mounts, instead of navigating.
 */
export function TalkToFounderButton({ surface, className, children }: { surface: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openFounderChat(surface)} className={className}>
      {children}
    </button>
  );
}
