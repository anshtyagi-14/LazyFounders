import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

export interface LockHandle {
  key: string;
  token: string;
  release(): Promise<void>;
}

/** Mutual exclusion across processes/replicas. acquire() never waits: null = someone else holds it. */
export interface DistributedLock {
  acquire(key: string, ttlMs: number): Promise<LockHandle | null>;
}

const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class RedisLock implements DistributedLock {
  constructor(private readonly redis: Redis, private readonly prefix = 'lf:v2:lock:') {}

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const token = randomUUID();
    const full = this.prefix + key;
    const ok = await this.redis.set(full, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return {
      key: full,
      token,
      // Only the holder's token can release, so an expired lock re-acquired by another
      // replica is never deleted by the original (slow) holder.
      release: async () => {
        await this.redis.eval(RELEASE, 1, full, token);
      },
    };
  }
}

export class InMemoryLock implements DistributedLock {
  private readonly held = new Map<string, { token: string; expires: number }>();
  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const now = Date.now();
    const cur = this.held.get(key);
    if (cur && cur.expires > now) return null;
    const token = randomUUID();
    this.held.set(key, { token, expires: now + ttlMs });
    return {
      key,
      token,
      release: async () => {
        if (this.held.get(key)?.token === token) this.held.delete(key);
      },
    };
  }
}
