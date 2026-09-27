import React from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/articles";
import { CATEGORY_LINKS, FOLLOW_LINKS, TRUST_LINKS } from "@/lib/nav";
import { gaAttrs } from "@/lib/ga-attrs";
import { EmailCapture } from "./EmailCapture";
import { SocialIcon } from "./site/SocialIcon";
import { Wordmark } from "./site/Wordmark";

/**
 * Static footer: the six categories, the trust pages, where to follow, and the
 * early-access form. No database reads, and no long generated link lists.
 */

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-500">
      {children}
    </h2>
  );
}

function FooterLink({
  href,
  children,
  ...rest
}: { href: string; children: React.ReactNode } & Record<string, string>) {
  return (
    <Link
      href={href}
      {...rest}
      className="block py-1.5 text-sm text-gray-600 transition-colors hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-400"
    >
      {children}
    </Link>
  );
}

const STICKER =
  "inline-flex min-h-[2.625rem] items-center gap-[0.5625rem] bg-white px-3 py-[0.47rem] shadow-sm ring-1 ring-black/10 transition-transform hover:-translate-y-0.5 dark:ring-white/10";
const STICKER_LABEL = "text-left font-display text-[0.465rem] font-bold uppercase leading-tight tracking-[0.12em] text-slate-500";

/** The platform and the agency behind the site, as white stickers that read the same in both themes. */
function PartnerStickers() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href="https://blogy.in"
        target="_blank"
        rel="noopener"
        {...gaAttrs("partner_select", { content_id: "blogy", source_surface: "footer" })}
        className={STICKER}
      >
        <span className={STICKER_LABEL}>
          Powered
          <br />
          by
        </span>
        <span className="flex items-center gap-[0.28rem]">
          <Image src="/partners/blogy-mark.svg" alt="" width={21} height={21} className="size-[1.3125rem]" />
          <span className="font-display text-[0.84rem] font-bold tracking-tight text-slate-950">Blogy</span>
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <a
        href="https://gigzman.com"
        target="_blank"
        rel="noopener"
        {...gaAttrs("partner_select", { content_id: "gigzman", source_surface: "footer" })}
        className={STICKER}
      >
        <span className={STICKER_LABEL}>
          Managed &amp;
          <br />
          developed by
        </span>
        <Image src="/partners/gigzman-black.png" alt="gigzman" width={84} height={21} className="h-[1.3125rem] w-auto" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-gray-50 dark:border-white/10 dark:bg-[#0e0e11]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-10 border-b border-black/10 pb-8 dark:border-white/10">
          <Wordmark size="lg" />
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <nav aria-label="Sections">
            <ColumnHeading>Sections</ColumnHeading>
            {CATEGORY_LINKS.map((l) => (
              <FooterLink
                key={l.href}
                href={l.href}
                {...gaAttrs("category_select", {
                  category: l.label,
                  source_surface: "footer",
                })}
              >
                {l.label}
              </FooterLink>
            ))}
          </nav>

          <nav aria-label={`About ${BRAND}`}>
            <ColumnHeading>About</ColumnHeading>
            {TRUST_LINKS.map((l) => (
              <FooterLink key={l.href} href={l.href}>
                {l.label}
              </FooterLink>
            ))}
          </nav>

          <nav aria-label="Follow">
            <ColumnHeading>Follow</ColumnHeading>
            <ul className="flex flex-wrap gap-2.5">
              {FOLLOW_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    {...gaAttrs(l.event, l.external ? { content_id: l.label, source_surface: "footer" } : { source_surface: "footer" })}
                    title={l.label === "X" ? "X (Twitter)" : l.label}
                    className="flex size-10 items-center justify-center rounded-full border border-black/10 bg-white text-gray-700 transition-colors hover:border-teal-500/60 hover:text-teal-700 dark:border-white/12 dark:bg-white/5 dark:text-gray-300 dark:hover:text-teal-400"
                  >
                    <SocialIcon label={l.label} />
                    <span className="sr-only">
                      {l.label === "X" ? "X (Twitter)" : l.label}
                      {l.external ? " (opens in a new tab)" : " feed"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <EmailCapture
              location="footer"
              compact
              heading="The daily brief"
              blurb="Startup, funding and AI news in a five-minute read. Join the early-access list."
            />
          </div>
        </div>
      </div>

      {/* The masthead again, at scale: the reader leaves the page knowing whose
          publication they were reading. */}
      <div className="mx-auto max-w-7xl overflow-hidden px-4 sm:px-6 lg:px-8">
        {/* Sized to bleed off the edge, clipped by the wrapper: without the clip
            this single word widens the document and the whole page scrolls sideways. */}
        {/* Drawn from a pseudo-element: the watermark is meant to be faint, and as
            real text it fails every contrast audit despite being aria-hidden. */}
        <div
          aria-hidden="true"
          data-wordmark={BRAND}
          className="select-none whitespace-nowrap border-t border-black/10 pt-10 font-display text-[13vw] font-extrabold uppercase leading-[0.8] tracking-[-0.045em] text-black/5 before:content-[attr(data-wordmark)] dark:border-white/10 dark:text-white/8 lg:text-[10.5rem]"
        />
      </div>

      {/* Bottom padding clears the floating WhatsApp button, which would otherwise sit on the stickers. */}
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-6 text-xs text-gray-500 dark:border-white/10">
          <p>
            &copy; {new Date().getFullYear()} {BRAND}. All rights reserved.
            {" · "}
            <a
              href="/sitemap.xml"
              className="underline hover:text-teal-700 dark:hover:text-teal-400"
            >
              Sitemap
            </a>
          </p>
          <PartnerStickers />
        </div>
      </div>
    </footer>
  );
}
