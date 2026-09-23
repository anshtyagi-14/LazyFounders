import React from "react";

/** "Lazy Founder · Powered by Blogy.in" plate closing every article page. */
export function PoweredByBlogy() {
  return (
    <div className="mt-12 flex justify-start">
      <a
        href="https://blogy.in"
        target="_blank"
        rel="noreferrer sponsored"
        aria-label="Lazy Founder, powered by Blogy.in"
      >
        {/* Art is 800x267 with its own dark rounded plate - width follows the height. */}
        <img
          src="/powered-by-blogy.png"
          alt="Lazy Founder - Powered by Blogy.in"
          width={1200}
          height={267}
          loading="lazy"
          className="h-12 sm:h-14 w-auto select-none"
        />
      </a>
    </div>
  );
}
