'use client';

import React from 'react';

/** Window event the <FounderChat /> widget listens for; `detail.surface` names the button for GA. */
export const OPEN_FOUNDER_CHAT = 'lf:open-founder-chat';

export function openFounderChat(surface: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_FOUNDER_CHAT, { detail: { surface } }));
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
 * page): it opens the chat widget that the root layout mounts, instead of navigating.
 */
export function TalkToFounderButton({ surface, className, children }: { surface: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openFounderChat(surface)} className={className}>
      {children}
    </button>
  );
}
