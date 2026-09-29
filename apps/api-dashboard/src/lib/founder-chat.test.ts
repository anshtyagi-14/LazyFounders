import { beforeEach, describe, expect, test, vi } from 'vitest';

type Chat = { id: string; name: string; email: string; status: string; tokenHash: string; referrer?: string; unreadByAdmin: number; unreadByVisitor: number; lastMessageAt: Date };
type Msg = { id: string; chatId: string; author: string; editor?: string; body: string; createdAt: Date };
const chats = new Map<string, Chat>();
const msgs: Msg[] = [];
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

type Data = Record<string, unknown>;
function apply(row: Chat, data: Data) {
  for (const [k, v] of Object.entries(data)) {
    const inc = (v as { increment?: number } | null)?.increment;
    (row as unknown as Data)[k] = inc !== undefined ? ((row as unknown as Data)[k] as number) + inc : v;
  }
  return row;
}

vi.mock('./prisma', () => ({
  prisma: {
    founderChat: {
      create: async ({ data }: { data: Data & { messages: { create: Omit<Msg, 'id' | 'chatId'> } } }) => {
        const { messages, ...rest } = data;
        const row = { status: 'open', unreadByVisitor: 0, ...rest, id: uuid() } as unknown as Chat;
        chats.set(row.id, row);
        msgs.push({ ...messages.create, id: uuid(), chatId: row.id });
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => chats.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Data }) => apply(chats.get(where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: string }; data: Data }) => {
        const row = chats.get(where.id);
        if (row) apply(row, data);
        return { count: row ? 1 : 0 };
      },
    },
    founderChatMessage: {
      create: async ({ data }: { data: Omit<Msg, 'id'> }) => {
        const m = { ...data, id: uuid() };
        msgs.push(m);
        return m;
      },
      findMany: async ({ where }: { where: { chatId: string } }) => msgs.filter((m) => m.chatId === where.chatId),
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { startChat, getVisitorChat, postVisitorMessage, postFounderReply, setChatStatus, markAdminRead, visitorUnread } = await import('./founder-chat');

const NOW = 1_800_000_000_000;
const base = { name: 'Asha', email: ' Asha@Example.com ', message: 'Can we talk about a partnership?', renderedAt: NOW - 10_000 };

async function started() {
  const out = await startChat(base, NOW);
  if (out.kind !== 'started') throw new Error(out.kind);
  return out;
}

describe('founder chat', () => {
  beforeEach(() => {
    chats.clear();
    msgs.length = 0;
  });

  test('starting stores the first message and only a hash of the visitor secret', async () => {
    const { id, token } = await started();
    const row = chats.get(id)!;
    expect(row.email).toBe('asha@example.com');
    expect(row.tokenHash).not.toContain(token);
    expect(row.unreadByAdmin).toBe(1);
    const chat = await getVisitorChat(id, token);
    expect(chat?.messages.map((m) => [m.author, m.body])).toEqual([['visitor', 'Can we talk about a partnership?']]);
  });

  test('a wrong secret or a malformed id reads as not found', async () => {
    const { id } = await started();
    expect(await getVisitorChat(id, 'wrong')).toBeNull();
    expect(await getVisitorChat('not-a-uuid', 'x')).toBeNull();
    expect((await postVisitorMessage(id, 'wrong', { message: 'hi' })).kind).toBe('not_found');
  });

  test('bots are answered but nothing is stored', async () => {
    expect((await startChat({ ...base, company_website: 'spam.example' }, NOW)).kind).toBe('bot');
    expect((await startChat({ ...base, renderedAt: NOW - 500 }, NOW)).kind).toBe('bot');
    expect(chats.size).toBe(0);
  });

  test('rejects an empty message or a bad email with a reader-facing message', async () => {
    expect(await startChat({ ...base, message: '   ' }, NOW)).toEqual({ kind: 'invalid', message: 'Please write a message.' });
    expect(await startChat({ ...base, email: 'nope' }, NOW)).toEqual({ kind: 'invalid', message: 'Please enter a valid email address.' });
  });

  test('unread counters move with each side', async () => {
    const { id, token } = await started();
    await postVisitorMessage(id, token, { message: 'Also, pricing?' });
    expect(chats.get(id)!.unreadByAdmin).toBe(2);
    await markAdminRead(id);
    expect(chats.get(id)!.unreadByAdmin).toBe(0);

    await postFounderReply(id, 'tarun', { message: 'Happy to. Sending details.' });
    expect(await visitorUnread(id, token)).toBe(1);
    const chat = await getVisitorChat(id, token);
    expect(chat?.messages.at(-1)).toMatchObject({ author: 'founder', body: 'Happy to. Sending details.' });
    expect(await visitorUnread(id, token)).toBe(0);
  });

  test('a closed chat takes no visitor messages until the founder replies', async () => {
    const { id, token } = await started();
    await setChatStatus(id, 'closed');
    expect((await postVisitorMessage(id, token, { message: 'hello?' })).kind).toBe('closed');
    await postFounderReply(id, 'tarun', { message: 'Reopening this.' });
    expect(chats.get(id)!.status).toBe('open');
    expect((await postVisitorMessage(id, token, { message: 'thanks' })).kind).toBe('posted');
  });
});
