'use client';

import React, { useEffect, useRef, useState } from 'react';
import { reportError, track } from '@/lib/analytics';

const BRAND_FALLBACK = '/fallback.webp';
/** Share of broken-image events that are beaconed to the error log (GA gets all of them). */
const IMAGE_ERROR_SAMPLE = 0.2;

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Swap in this image when the source fails. Defaults to the 11KB brand card;
   * pass null to render a flat panel instead.
   */
  fallbackSrc?: string | null;
  /**
   * Required, not optional. Pass the headline for a story image, or an explicit
   * empty string to declare the image decorative.
   */
  alt: string;
  /**
   * The one image that is already on screen when the page paints. It loads
   * eagerly and at high priority; everything else stays lazy. Marking more than
   * one image per page priority makes the setting meaningless.
   */
  priority?: boolean;
}

function hostOf(src: string): string {
  try {
    return new URL(src, window.location.href).hostname;
  } catch {
    return 'invalid-url';
  }
}

export function SafeImage({ src, fallbackSrc = BRAND_FALLBACK, alt, className, priority = false, ...props }: SafeImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  function handleError() {
    const current = typeof imgSrc === 'string' ? imgSrc : '';
    if (current && current !== fallbackSrc) {
      // Hotlinked publisher images fail often (hotlink blocks, expired CDN paths):
      // count them per host so the admin can see which sources to stop trusting.
      const host = hostOf(current);
      track('image_error', { error_type: 'image_load', content_id: host });
      if (Math.random() < IMAGE_ERROR_SAMPLE) reportError('image_error', `Image failed to load from ${host}`);
    }
    if (fallbackSrc && imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc);
      return;
    }
    setFailed(true);
  }

  // An image that failed before hydration never fires onError on the React
  // listener; a completed image with no pixels is that case.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) handleError();
    // Only on mount: later failures arrive through onError.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed || !imgSrc) {
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{ background: 'linear-gradient(135deg, #16161a 0%, #0e0e11 100%)' }}
      />
    );
  }

  return (
    <img
      ref={ref}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding={priority ? 'sync' : 'async'}
      {...props}
      className={className}
      src={imgSrc}
      alt={alt}
      onError={handleError}
    />
  );
}
