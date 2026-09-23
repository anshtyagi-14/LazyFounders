import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Load the repo-root .env (if present) for CLI use; real environments inject env vars. */
export function loadEnv(): void {
  for (const candidate of ['.env', '../.env', '../../.env']) {
    const p = resolve(process.cwd(), candidate);
    if (existsSync(p)) {
      (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(p);
      return;
    }
  }
}

export function repoPath(...parts: string[]): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, 'sources'))) return resolve(dir, ...parts);
    dir = resolve(dir, '..');
  }
  return resolve(process.cwd(), ...parts);
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export const cliLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => console.log(msg ?? '', JSON.stringify(obj)),
  warn: (obj: Record<string, unknown>, msg?: string) => console.warn(msg ?? '', JSON.stringify(obj)),
  error: (obj: Record<string, unknown>, msg?: string) => console.error(msg ?? '', JSON.stringify(obj)),
};

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
