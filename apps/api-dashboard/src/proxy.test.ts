import { randomBytes, scryptSync } from 'node:crypto';
import { beforeAll, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from './proxy';

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

beforeAll(() => {
  const salt = randomBytes(16);
  const hash = scryptSync('editor-pass', salt, 32);
  process.env.EDITOR_USERS = `ed:scrypt$${salt.toString('hex')}$${hash.toString('hex')}:editor`;
  process.env.ADMIN_USER = 'root';
  process.env.ADMIN_PASSWORD = 'admin-pass';
});

function run(path: string, init: { auth?: string; headers?: Record<string, string>; method?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set('authorization', init.auth);
  return proxy(new NextRequest(`https://lazyfounder.in${path}`, { headers, method: init.method ?? 'GET' }));
}

/** NextResponse.next() carries this header; a short-circuit response does not. */
const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

describe('proxy', () => {
  test('public pages and unknown URLs reach the router (so unknown URLs 404, not 401)', () => {
    for (const p of ['/', '/about', '/news/article/x', '/does-not-exist', '/.well-known/security.txt', '/sitemaps/news.xml']) {
      expect(passedThrough(run(p)), p).toBe(true);
    }
  });

  test('reader-facing API routes are public', () => {
    for (const p of ['/api/subscribe', '/api/telemetry', '/api/health', '/api/v1/scrape', '/api/revalidate']) {
      expect(passedThrough(run(p)), p).toBe(true);
    }
  });

  test('admin and internal API routes require a login', () => {
    for (const p of ['/admin', '/admin/pipeline', '/dashboard', '/tools/pipeline', '/api/stats', '/api/subscribe-export']) {
      const res = run(p);
      expect(res.status, p).toBe(401);
      expect(res.headers.get('www-authenticate')).toContain('Basic');
    }
  });

  test('editors get in, but not to admin-only areas', () => {
    expect(passedThrough(run('/admin', { auth: basic('ed', 'editor-pass') }))).toBe(true);
    expect(run('/admin/registry', { auth: basic('ed', 'editor-pass') }).status).toBe(403);
    expect(passedThrough(run('/admin/registry', { auth: basic('root', 'admin-pass') }))).toBe(true);
  });

  test('a server action posted to a public page still needs a login', () => {
    expect(run('/', { method: 'POST', headers: { 'next-action': 'abc123' } }).status).toBe(401);
  });

  test('strips identity headers a client tries to forge', () => {
    const res = run('/about', { headers: { 'x-editor-user': 'root', 'x-editor-role': 'admin' } });
    expect(res.headers.get('x-middleware-request-x-editor-user')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-editor-role')).toBeNull();
  });
});
