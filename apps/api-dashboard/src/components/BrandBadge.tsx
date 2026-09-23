import React from 'react';

/** "Lazy Founder · Powered by Blogy.in" badge overlaid on article images. Parent must be `relative`. */
export function BrandBadge({
  position = 'bottom-right',
  size = 'sm',
}: {
  position?: 'bottom-right' | 'bottom-left' | 'top-right';
  size?: 'sm' | 'md';
}) {
  // Tailwind is compiled from source again, so arbitrary values are safe here.
  const pos = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
  }[position];
  // Badge art is 500x120 with its own dark rounded plate — width follows the height.
  const dims = size === 'md' ? 'h-9' : 'h-6';

  return (
    <img
      src="/brand-badge.png"
      alt=""
      aria-hidden="true"
      className={`absolute ${pos} z-10 ${dims} w-auto drop-shadow-lg pointer-events-none select-none`}
    />
  );
}
