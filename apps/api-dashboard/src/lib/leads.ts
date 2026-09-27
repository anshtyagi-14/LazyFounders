import 'server-only';
import { z } from 'zod';
import { prisma } from './prisma';
import { MIN_FILL_MS } from './email-signup';
import { INQUIRY_TYPES, LEAD_STATUSES, type LeadStatus } from './lead-options';

export const LEAD_SUCCESS_MESSAGE = 'Thanks, we have your message. Someone from our team will get back to you within two working days.';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const LeadInput = z.object({
  name: z.string().trim().min(1, 'Please tell us your name.').max(120),
  email: z.string().trim().toLowerCase().max(254).email('Please enter a valid email address.'),
  company: optionalText(160),
  phone: optionalText(40).refine((v) => !v || /^[+()\d\s.-]{6,40}$/.test(v), 'Please enter a valid phone number.'),
  inquiryType: z.enum(INQUIRY_TYPES.map((t) => t.value) as [string, ...string[]]),
  message: z.string().trim().min(10, 'Please add a little more detail (10 characters or more).').max(5000),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(100),
  referrer: optionalText(500),
  /** Honeypot: hidden from people, filled by naive bots. */
  company_website: z.string().optional(),
  /** Epoch ms when the form rendered. */
  renderedAt: z.number().int().optional(),
});

export type LeadOutcome = { kind: 'stored' } | { kind: 'bot' } | { kind: 'invalid'; message: string };

/** Keep only the origin of the referrer: the path could carry someone's search or token. */
function referrerOrigin(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

/** Validate and store one contact-form enquiry. */
export async function storeLead(raw: unknown, now = Date.now()): Promise<LeadOutcome> {
  const parsed = LeadInput.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = String(first?.path[0] ?? '');
    const friendly = ['name', 'email', 'phone', 'message'].includes(field) ? first.message : 'Invalid submission.';
    return { kind: 'invalid', message: friendly };
  }
  const input = parsed.data;

  // Bots get a success-shaped answer and nothing is stored.
  if (input.company_website) return { kind: 'bot' };
  if (input.renderedAt !== undefined && now - input.renderedAt < MIN_FILL_MS) return { kind: 'bot' };

  await prisma.lead.create({
    data: {
      name: input.name,
      email: input.email,
      company: input.company,
      phone: input.phone,
      inquiryType: input.inquiryType,
      message: input.message,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      referrer: referrerOrigin(input.referrer),
      createdAt: new Date(now),
    },
  });
  return { kind: 'stored' };
}

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v);
}
