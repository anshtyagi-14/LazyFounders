import { beforeEach, describe, expect, test, vi } from 'vitest';

type Row = { id: string; email: string; attempts: number; signupLocation: string; utmSource?: string; referrer?: string };
const rows = new Map<string, Row>();

vi.mock('./prisma', () => ({
  prisma: {
    emailSignup: {
      findUnique: async ({ where }: { where: { email: string } }) => rows.get(where.email) ?? null,
      update: async ({ where, data }: { where: { id?: string; email?: string }; data: { attempts: { increment: number } } }) => {
        const row = [...rows.values()].find((r) => r.id === where.id || r.email === where.email)!;
        row.attempts += data.attempts.increment;
        return row;
      },
      create: async ({ data }: { data: Omit<Row, 'id' | 'attempts'> }) => {
        const row = { ...data, id: String(rows.size + 1), attempts: 1 } as Row;
        rows.set(row.email, row);
        return row;
      },
    },
  },
}));

const { storeSignup } = await import('./email-signup');

const NOW = 1_800_000_000_000;
const base = { location: 'homepage', renderedAt: NOW - 10_000 };

describe('storeSignup', () => {
  beforeEach(() => rows.clear());

  test('stores a new address, lowercased, with where it came from', async () => {
    const out = await storeSignup(
      { ...base, email: '  Founder@Example.COM ', utmSource: 'x', referrer: 'https://news.example.com/some/path?token=secret' },
      NOW,
    );
    expect(out.kind).toBe('stored');
    const row = rows.get('founder@example.com')!;
    expect(row).toMatchObject({ signupLocation: 'homepage', utmSource: 'x', attempts: 1 });
    // Only the referrer's origin is kept: its path could carry someone's search or token.
    expect(row.referrer).toBe('https://news.example.com');
  });

  test('a repeat address bumps the attempt count instead of erroring', async () => {
    await storeSignup({ ...base, email: 'a@b.co' }, NOW);
    const out = await storeSignup({ ...base, email: 'A@B.co', location: 'footer' }, NOW);
    expect(out.kind).toBe('duplicate');
    expect(rows.size).toBe(1);
    expect(rows.get('a@b.co')!.attempts).toBe(2);
  });

  test('rejects an invalid email with a reader-facing message', async () => {
    const out = await storeSignup({ ...base, email: 'not-an-email' }, NOW);
    expect(out).toEqual({ kind: 'invalid', message: 'Please enter a valid email address.' });
    expect(rows.size).toBe(0);
  });

  test('rejects an unknown signup location', async () => {
    expect((await storeSignup({ ...base, email: 'a@b.co', location: 'sidebar' }, NOW)).kind).toBe('invalid');
  });

  test('drops honeypot and too-fast submissions without storing them', async () => {
    expect((await storeSignup({ ...base, email: 'bot@b.co', company_website: 'http://spam' }, NOW)).kind).toBe('bot');
    expect((await storeSignup({ ...base, email: 'fast@b.co', renderedAt: NOW - 500 }, NOW)).kind).toBe('bot');
    expect(rows.size).toBe(0);
  });
});
