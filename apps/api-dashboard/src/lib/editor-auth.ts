import { scryptSync, timingSafeEqual } from 'node:crypto';

export type EditorRole = 'editor' | 'admin';

export interface Editor {
  user: string;
  role: EditorRole;
}

interface Account {
  user: string;
  role: EditorRole;
  verify(password: string): boolean;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Accounts come from the environment (no second auth system):
 *   EDITOR_USERS="alice:scrypt$<saltHex>$<hashHex>:editor,bob:scrypt$<saltHex>$<hashHex>:admin"
 *     (generate with: node apps/api-dashboard/scripts/hash-password.mjs <password>)
 *   ADMIN_USER / ADMIN_PASSWORD   legacy single admin account (still supported).
 * There are no built-in default credentials: with nothing configured, access is denied.
 */
function loadAccounts(): Account[] {
  const accounts: Account[] = [];
  for (const entry of (process.env.EDITOR_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [user, hashSpec, role] = entry.split(':');
    const [scheme, saltHex, hashHex] = (hashSpec ?? '').split('$');
    if (!user || scheme !== 'scrypt' || !saltHex || !hashHex) continue;
    const expected = Buffer.from(hashHex, 'hex');
    accounts.push({
      user,
      role: role === 'admin' ? 'admin' : 'editor',
      verify: (password) => safeEqual(scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length), expected),
    });
  }
  if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
    const expected = Buffer.from(process.env.ADMIN_PASSWORD);
    accounts.push({ user: process.env.ADMIN_USER, role: 'admin', verify: (p) => safeEqual(Buffer.from(p), expected) });
  }
  return accounts;
}

const cache = new Map<string, { editor: Editor | null; at: number }>();
const CACHE_TTL_MS = 5 * 60_000;

export function authConfigured(): boolean {
  return loadAccounts().length > 0;
}

/** Verify an `Authorization: Basic ...` header. Results are cached briefly (scrypt is slow on purpose). */
export function verifyBasicAuth(header: string | null): Editor | null {
  if (!header?.startsWith('Basic ')) return null;
  const hit = cache.get(header);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.editor;

  let editor: Editor | null = null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const password = decoded.slice(idx + 1);
    const account = loadAccounts().find((a) => a.user === user);
    if (idx > 0 && account?.verify(password)) editor = { user: account.user, role: account.role };
  } catch {
    editor = null;
  }
  if (cache.size > 200) cache.clear();
  cache.set(header, { editor, at: Date.now() });
  return editor;
}

/** Identity set by proxy.ts for authenticated requests (incoming copies are stripped). */
export function editorFromHeaders(headers: Headers): Editor | null {
  const user = headers.get('x-editor-user');
  const role = headers.get('x-editor-role');
  if (!user || (role !== 'editor' && role !== 'admin')) return null;
  return { user, role };
}
