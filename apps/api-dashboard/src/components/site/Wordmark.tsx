import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/articles';

/**
 * The masthead wordmark. Set in the display face at a heavy weight with the
 * second half in gold, so the name reads as a masthead rather than a logo slot.
 */
export function Wordmark({ className = '', size = 'md' }: { className?: string; size?: 'md' | 'lg' | 'xl' }) {
  const scale = {
    md: 'text-xl sm:text-2xl',
    lg: 'text-3xl sm:text-4xl',
    xl: 'text-5xl sm:text-7xl lg:text-8xl',
  }[size];

  // BRAND is configurable; split it so the gold lands on the second word when
  // there is one, and on nothing when the name is a single word.
  const match = /^(Lazy)(Founders)$/i.exec(BRAND);

  return (
    <Link
      href="/"
      aria-label={BRAND + ' home'}
      className={'font-display font-extrabold uppercase leading-none tracking-[-0.03em] text-white ' + scale + ' ' + className}
    >
      {match ? (
        <>
          {match[1]}
          <span className="text-teal-500">{match[2]}</span>
        </>
      ) : (
        BRAND
      )}
    </Link>
  );
}
