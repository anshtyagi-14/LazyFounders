#!/usr/bin/env node
// Usage: node apps/api-dashboard/scripts/hash-password.mjs '<password>' [user] [editor|admin]
// Prints an EDITOR_USERS entry. Never commit the output with a real password's hash to git.
import { randomBytes, scryptSync } from 'node:crypto';

const [password, user = 'editor', role = 'editor'] = process.argv.slice(2);
if (!password || password.length < 12) {
  console.error('Provide a password of at least 12 characters.');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
console.log(`${user}:scrypt$${salt.toString('hex')}$${hash.toString('hex')}:${role === 'admin' ? 'admin' : 'editor'}`);
