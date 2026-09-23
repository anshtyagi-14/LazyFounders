'use client';

import React, { useState } from 'react';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Swap in this image when the source fails. Left unset, a failure renders a
   * flat panel instead - the stock placeholder is a 616KB JPEG, which is a lot of
   * bandwidth to spend telling the reader that a picture is missing.
   */
  fallbackSrc?: string;
}

export function SafeImage({ src, fallbackSrc, alt, className, ...props }: SafeImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  // Remote publisher images fail often enough - hotlink blocks, expired CDN
  // paths - that the broken state has to look deliberate rather than broken.
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
      loading="lazy"
      decoding="async"
      {...props}
      className={className}
      src={imgSrc}
      alt={alt || ''}
      onError={() => {
        if (fallbackSrc && imgSrc !== fallbackSrc) {
          setImgSrc(fallbackSrc);
          return;
        }
        setFailed(true);
      }}
    />
  );
}
