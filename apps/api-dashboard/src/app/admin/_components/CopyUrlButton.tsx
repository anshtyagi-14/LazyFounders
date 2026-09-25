'use client';

import React, { useState } from 'react';

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="text-xs font-medium text-slate-600 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
    >
      {copied ? 'Copied' : 'Copy URL'}
    </button>
  );
}
