'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * The only interactive part of the masthead.
 *
 * The topic and company lists are rendered on the server and handed down as
 * `children`, so none of that data ships as JavaScript. This island owns open and
 * closed state, Escape, outside-click and the mobile drawer, and nothing else.
 */

export interface DropdownProps {
  label: string;
  children: React.ReactNode;
  /** Width class for the panel; topic panels are wider than company panels. */
  panelClassName?: string;
}

export function NavDropdown({ label, children, panelClassName = '' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-1 py-2 text-sm font-medium text-gray-300 hover:text-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-500 transition-colors"
      >
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={'transition-transform duration-200 ' + (open ? 'rotate-180' : '')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className={
          'absolute left-0 top-full z-50 mt-3 max-h-[70vh] overflow-y-auto border border-white/10 bg-[#0e0e11] p-6 shadow-2xl shadow-black/60 custom-scrollbar ' +
          panelClassName
        }
      >
        {children}
      </div>
    </div>
  );
}

export function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    // Stop the page scrolling behind the drawer.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden -ml-2 p-2 text-white hover:text-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      <div
        id={panelId}
        hidden={!open}
        onClick={close}
        className="lg:hidden fixed inset-x-0 bottom-0 top-[var(--header-h)] z-40 overflow-y-auto border-t border-white/10 bg-[#08080a] px-5 py-8 custom-scrollbar"
      >
        {children}
      </div>
    </>
  );
}
