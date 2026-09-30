import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BRAND } from '@/lib/articles';

/**
 * The masthead wordmark. Set in the display face at a heavy weight with the
 * second half in gold, so the name reads as a masthead rather than a logo slot.
 */
export function Wordmark({
  className = '',
  size = 'md',
  compactOnMobile = false,
}: {
  className?: string;
  size?: 'md' | 'lg' | 'xl';
  compactOnMobile?: boolean;
}) {
  const scale = {
    md: 'text-xl sm:text-2xl',
    lg: 'text-3xl sm:text-4xl',
    xl: 'text-5xl sm:text-7xl lg:text-8xl',
  }[size];
  const markScale = {
    md: 'size-9',
    lg: 'size-12',
    xl: 'size-20 sm:size-24',
  }[size];

  // BRAND is configurable; split it so the gold lands on the second word when
  // there is one, and on nothing when the name is a single word.
  const match = /^(Lazy)(Founders?)$/i.exec(BRAND);

  return (
    <Link
      href="/"
      aria-label={BRAND + ' home'}
      className={'inline-flex items-center gap-2.5 text-gray-950 dark:text-white ' + className}
    >
      <Image
        src="/logo-mark.png"
        width={96}
        height={96}
        alt=""
        priority={size === 'md'}
        className={'shrink-0 rounded-[22%] ' + markScale}
      />
      <span
        className={
          'font-display font-extrabold uppercase leading-none tracking-[-0.03em] ' +
          scale +
          (compactOnMobile ? ' hidden sm:inline' : '')
        }
      >
        {match ? (
          <>
            {match[1]}
            {/* The brand gold in both themes: a logo, so not darkened by the light-mode text-contrast rule in globals.css. */}
            <span className="text-(--gold-500)">{match[2]}</span>
          </>
        ) : (
          BRAND
        )}
      </span>
    </Link>
  );
}
