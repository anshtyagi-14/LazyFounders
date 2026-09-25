/**
 * Contact details shown on the trust pages (/about, /contact, /corrections,
 * /terms, /disclaimer) and in security.txt.
 *
 * Every address routes to one inbox. Keep public/.well-known/security.txt in
 * sync with `security`.
 */
const INBOX = 'tarun.kumar@blogy.in';

export const SITE_CONTACTS = {
  /** General enquiries and feedback. */
  general: INBOX,
  /** Corrections, factual disputes, source complaints. */
  editorial: INBOX,
  /** Partnerships and advertising. */
  commercial: INBOX,
  /** Vulnerability reports. */
  security: INBOX,
  /** Registered legal entity that operates the site. Empty until confirmed. */
  legalEntity: '',
  /** Registered office / jurisdiction for the terms. */
  jurisdiction: 'India',
} as const;

/** Set to true once the values above are real, to drop the "placeholder" notice. */
export const CONTACTS_CONFIRMED = true;
