/** Contact-form choices, shared by the public form, the API and the admin Leads page. */

export const INQUIRY_TYPES = [
  { value: 'advertising', label: 'Advertising and sponsorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'content', label: 'Content and SEO services' },
  { value: 'other', label: 'Something else' },
] as const;

export type InquiryType = (typeof INQUIRY_TYPES)[number]['value'];

export const LEAD_STATUSES = ['new', 'contacted', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function inquiryLabel(value: string): string {
  return INQUIRY_TYPES.find((t) => t.value === value)?.label ?? value;
}
