import { describe, expect, test } from 'vitest';
import type Redis from 'ioredis';

import { clientIp, rateLimit } from './rate-limit';

function fakeRedis() {
  const counts = new Map<string, number>();
  return {
    incr: async (k: string) => {
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return n;
    },
    expire: async () => 1,
  } as unknown as Redis;
}

describe('rateLimit', () => {
  test('allows up to the limit in a window, then refuses', async () => {
    const redis = fakeRedis();
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await rateLimit('t', '1.2.3.4', 3, 60, redis)).ok);
    expect(results).toEqual([true, true, true, false]);
  });

  test('counts each identity separately', async () => {
    const redis = fakeRedis();
    await rateLimit('t', 'a', 1, 60, redis);
    expect((await rateLimit('t', 'b', 1, 60, redis)).ok).toBe(true);
    expect((await rateLimit('t', 'a', 1, 60, redis)).ok).toBe(false);
  });

  test('fails open when Redis is unavailable', async () => {
    const broken = { incr: async () => { throw new Error('ECONNREFUSED'); } } as unknown as Redis;
    const res = await rateLimit('t', 'a', 1, 60, broken);
    expect(res.ok).toBe(true);
  });
});

describe('clientIp', () => {
  test('takes the left-most X-Forwarded-For entry (the client, as the ALB appends)', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
