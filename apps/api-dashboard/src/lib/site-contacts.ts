/**
 * Contact details shown on the trust pages (/about, /contact, /corrections,
 * /terms, /disclaimer) and in security.txt.
 *
 * TODO(contacts): these are PLACEHOLDERS. Replace every value below with the
 * real addresses and legal entity before launch, and update
 * public/.well-known/security.txt to match.
 */
export const SITE_CONTACTS = {
  /** General enquiries and feedback. */
  general: 'hello@lazyfounder.in',
  /** Corrections, factual disputes, source complaints. */
  editorial: 'corrections@lazyfounder.in',
  /** Partnerships and advertising. */
  commercial: 'partnerships@lazyfounder.in',
  /** Vulnerability reports. */
  security: 'security@lazyfounder.in',
  /** Registered legal entity that operates the site. Empty until confirmed. */
  legalEntity: '',
  /** Registered office / jurisdiction for the terms. */
  jurisdiction: 'India',
} as const;

/** Set to true once the values above are real, to drop the "placeholder" notice. */
export const CONTACTS_CONFIRMED = false;
