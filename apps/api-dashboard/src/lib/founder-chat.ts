import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './prisma';
import { MIN_FILL_MS } from './email-signup';

/**
 * "Talk to founder": a reader writes from the chat widget, an editor answers from
 * /admin/chat, and the reader sees the answer the next time the widget polls.
 *
 * The widget has no login. Starting a chat hands the browser a random secret; only
 * its hash is stored, and every later read or message must present the secret.
 */

export const CHAT_STATUSES = ['open', 'closed'] as const;
export type ChatStatus = (typeof CHAT_STATUSES)[number];

export const MAX_MESSAGE_CHARS = 2000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const messageBody = z
  .string()
  .trim()
  .min(1, 'Please write a message.')
  .max(MAX_MESSAGE_CHARS, `Please keep it under ${MAX_MESSAGE_CHARS} characters.`);

export const StartChatInput = z.object({
  name: z.string().trim().min(1, 'Please tell us your name.').max(120),
  email: z.string().trim().toLowerCase().max(254).email('Please enter a valid email address.'),
  message: messageBody,
  pagePath: optionalText(300),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(100),
  referrer: optionalText(500),
  /** Honeypot: hidden from people, filled by naive bots. */
  company_website: z.string().optional(),
  /** Epoch ms when the form rendered. */
  renderedAt: z.number().int().optional(),
});

export const VisitorMessageInput = z.object({ message: messageBody });

export type PublicMessage = { id: string; author: 'visitor' | 'founder'; body: string; createdAt: string };
export type PublicChat = { id: string; status: ChatStatus; messages: PublicMessage[] };

export type StartOutcome = { kind: 'started'; id: string; token: string } | { kind: 'bot' } | { kind: 'invalid'; message: string };
export type PostOutcome = { kind: 'posted'; message: PublicMessage } | { kind: 'not_found' } | { kind: 'closed' } | { kind: 'invalid'; message: string };

export function isChatStatus(v: unknown): v is ChatStatus {
  return typeof v === 'string' && (CHAT_STATUSES as readonly string[]).includes(v);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Keep only the origin of the referrer: the path could carry someone's search or token. */
function referrerOrigin(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

function firstIssue(error: z.ZodError, fields: string[]): string {
  const first = error.issues[0];
  return fields.includes(String(first?.path[0] ?? '')) ? first.message : 'Invalid submission.';
}

function toPublicMessage(m: { id: string; author: string; body: string; createdAt: Date }): PublicMessage {
  return { id: m.id, author: m.author === 'founder' ? 'founder' : 'visitor', body: m.body, createdAt: m.createdAt.toISOString() };
}

/** Load a chat for its visitor, or null when the id is unknown or the secret is wrong (indistinguishable). */
async function authorisedChat(id: string, token: string) {
  if (!z.string().uuid().safeParse(id).success || !token) return null;
  const chat = await prisma.founderChat.findUnique({ where: { id } });
  return chat && tokenMatches(token, chat.tokenHash) ? chat : null;
}

/** Validate and store the first message of a new conversation. */
export async function startChat(raw: unknown, now = Date.now()): Promise<StartOutcome> {
  const parsed = StartChatInput.safeParse(raw);
  if (!parsed.success) return { kind: 'invalid', message: firstIssue(parsed.error, ['name', 'email', 'message']) };
  const input = parsed.data;

  // Bots get a success-shaped answer and nothing is stored.
  if (input.company_website) return { kind: 'bot' };
  if (input.renderedAt !== undefined && now - input.renderedAt < MIN_FILL_MS) return { kind: 'bot' };

  const token = randomBytes(32).toString('base64url');
  const at = new Date(now);
  const chat = await prisma.founderChat.create({
    data: {
      name: input.name,
      email: input.email,
      tokenHash: hashToken(token),
      pagePath: input.pagePath,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      referrer: referrerOrigin(input.referrer),
      unreadByAdmin: 1,
      lastMessageAt: at,
      createdAt: at,
      messages: { create: { author: 'visitor', body: input.message, createdAt: at } },
    },
  });
  return { kind: 'started', id: chat.id, token };
}

/** The conversation as its visitor sees it. Reading it clears the visitor's unread count. */
export async function getVisitorChat(id: string, token: string): Promise<PublicChat | null> {
  const chat = await authorisedChat(id, token);
  if (!chat) return null;
  const messages = await prisma.founderChatMessage.findMany({ where: { chatId: id }, orderBy: { createdAt: 'asc' } });
  if (chat.unreadByVisitor > 0) await prisma.founderChat.update({ where: { id }, data: { unreadByVisitor: 0 } });
  return { id, status: isChatStatus(chat.status) ? chat.status : 'open', messages: messages.map(toPublicMessage) };
}

/** How many founder replies the visitor has not seen yet (drives the widget's dot), or null when unauthorised. */
export async function visitorUnread(id: string, token: string): Promise<number | null> {
  const chat = await authorisedChat(id, token);
  return chat ? chat.unreadByVisitor : null;
}

/** A follow-up from the visitor. Closed conversations take no more messages. */
export async function postVisitorMessage(id: string, token: string, raw: unknown, now = Date.now()): Promise<PostOutcome> {
  const parsed = VisitorMessageInput.safeParse(raw);
  if (!parsed.success) return { kind: 'invalid', message: firstIssue(parsed.error, ['message']) };
  const chat = await authorisedChat(id, token);
  if (!chat) return { kind: 'not_found' };
  if (chat.status === 'closed') return { kind: 'closed' };

  const at = new Date(now);
  const [message] = await prisma.$transaction([
    prisma.founderChatMessage.create({ data: { chatId: id, author: 'visitor', body: parsed.data.message, createdAt: at } }),
    prisma.founderChat.update({ where: { id }, data: { unreadByAdmin: { increment: 1 }, lastMessageAt: at } }),
  ]);
  return { kind: 'posted', message: toPublicMessage(message) };
}

/** An editor's reply from /admin/chat. Replying reopens a closed conversation. */
export async function postFounderReply(id: string, editor: string, raw: unknown, now = Date.now()): Promise<PostOutcome> {
  const parsed = VisitorMessageInput.safeParse(raw);
  if (!parsed.success) return { kind: 'invalid', message: firstIssue(parsed.error, ['message']) };
  const chat = await prisma.founderChat.findUnique({ where: { id }, select: { id: true } });
  if (!chat) return { kind: 'not_found' };

  const at = new Date(now);
  const [message] = await prisma.$transaction([
    prisma.founderChatMessage.create({ data: { chatId: id, author: 'founder', editor, body: parsed.data.message, createdAt: at } }),
    prisma.founderChat.update({ where: { id }, data: { unreadByVisitor: { increment: 1 }, unreadByAdmin: 0, status: 'open', lastMessageAt: at } }),
  ]);
  return { kind: 'posted', message: toPublicMessage(message) };
}

export async function setChatStatus(id: string, status: ChatStatus): Promise<void> {
  await prisma.founderChat.update({ where: { id }, data: { status } });
}

export async function markAdminRead(id: string): Promise<void> {
  await prisma.founderChat.updateMany({ where: { id, unreadByAdmin: { gt: 0 } }, data: { unreadByAdmin: 0 } });
}
