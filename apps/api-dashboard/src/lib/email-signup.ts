import 'server-only';
import { z } from 'zod';
import { prisma } from './prisma';

export const SIGNUP_LOCATIONS = ['homepage', 'footer', 'article', 'about'] as const;
export type SignupLocation = (typeof SIGNUP_LOCATIONS)[number];

export const SIGNUP_SUCCESS_MESSAGE =
  'You’re on the early-access list. We’ll let you know when the LazyFounder Brief launches.';

/** A human needs at least this long between the form rendering and submitting it. */
export const MIN_FILL_MS = 2000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const SignupInput = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  location: z.enum(SIGNUP_LOCATIONS),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(100),
  referrer: optionalText(500),
  /** Honeypot: hidden from people, filled by naive bots. */
  company_website: z.string().optional(),
  /** Epoch ms when the form rendered. */
  renderedAt: z.number().int().optional(),
});
export type SignupInput = z.infer<typeof SignupInput>;

export type SignupOutcome =
  | { kind: 'stored' }
  | { kind: 'duplicate' }
  | { kind: 'bot' }
  | { kind: 'invalid'; message: string };

/** Keep only the origin of the referrer: the path could carry someone's search or token. */
function referrerOrigin(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

/**
 * Validate and store one submission. A duplicate address bumps its attempt
 * counter instead of erroring, and the caller answers it exactly like a new
 * signup, so the endpoint never reveals who is already on the list.
 */
export async function storeSignup(raw: unknown, now = Date.now()): Promise<SignupOutcome> {
  const parsed = SignupInput.safeParse(raw);
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((i) => i.path[0] === 'email');
    return { kind: 'invalid', message: emailIssue ? 'Please enter a valid email address.' : 'Invalid submission.' };
  }
  const input = parsed.data;

  // Bots get a success-shaped answer and nothing is stored, so there is no
  // signal to tune against.
  if (input.company_website) return { kind: 'bot' };
  if (input.renderedAt !== undefined && now - input.renderedAt < MIN_FILL_MS) return { kind: 'bot' };

  const existing = await prisma.emailSignup.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    await prisma.emailSignup.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 }, lastAttemptAt: new Date(now) },
    });
    return { kind: 'duplicate' };
  }

  try {
    await prisma.emailSignup.create({
      data: {
        email: input.email,
        signupLocation: input.location,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        referrer: referrerOrigin(input.referrer),
        createdAt: new Date(now),
        lastAttemptAt: new Date(now),
      },
    });
    return { kind: 'stored' };
  } catch (err) {
    // Two submissions of a new address racing each other: the loser is a duplicate.
    if ((err as { code?: string }).code === 'P2002') {
      await prisma.emailSignup.update({ where: { email: input.email }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date(now) } });
      return { kind: 'duplicate' };
    }
    throw err;
  }
}
