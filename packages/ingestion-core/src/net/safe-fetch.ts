import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch } from 'undici';
import { BlockedError, RetryableError, SsrfError, TerminalError } from '../errors';
import { hostOf } from './url-canonical';

/** Resolves a hostname to every address it maps to. Injectable for tests. */
export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Decides whether a host may be fetched at all (approved-domain allowlist). */
export type HostPolicy = (host: string) => boolean | Promise<boolean>;

export interface TransportRequest {
  url: URL;
  /** The already-validated IP the connection must be pinned to (defeats DNS rebinding). */
  address: string;
  headers: Record<string, string>;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  headers: Headers;
  /** Decompressed body stream. */
  body: AsyncIterable<Uint8Array> | null;
  /** Releases the connection once the body has been consumed. */
  close?: () => Promise<void>;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export interface SafeFetchOptions {
  hostPolicy: HostPolicy;
  resolver?: Resolver;
  transport?: Transport;
  userAgent?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

export interface SafeFetchRequest {
  url: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  /** Conditional GET support. */
  etag?: string | null;
  lastModified?: string | null;
}

export interface SafeFetchResponse {
  requestedUrl: string;
  finalUrl: string;
  redirects: string[];
  status: number;
  notModified: boolean;
  headers: Headers;
  body: Buffer;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
}

/**
 * Returns true only for globally routable unicast addresses.
 * Blocks loopback, private (RFC1918), link-local (incl. 169.254.169.254 metadata),
 * CGNAT, unique-local IPv6, multicast, reserved and unspecified ranges, and
 * IPv4-mapped IPv6 forms of all of those.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  return parsed.range() === 'unicast';
}

const ALLOWED_PORTS = new Set(['', '80', '443']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The only way pipeline code is allowed to reach the network.
 * Every hop (initial URL and each redirect) is checked for scheme, port, approved host
 * and public IP; the TCP connection is pinned to the validated IP; body size and time
 * are capped while streaming (after decompression, so gzip bombs are cut off too).
 */
export class SafeFetcher {
  private readonly resolver: Resolver;
  private readonly transport: Transport;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly maxBytes: number;

  constructor(private readonly opts: SafeFetchOptions) {
    this.resolver = opts.resolver ?? systemResolver;
    this.transport = opts.transport ?? undiciTransport;
    this.userAgent = opts.userAgent ?? process.env.CRAWLER_USER_AGENT ?? 'LazyFoundersBot/1.0 (+https://lazyfounders.com/bot)';
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.FETCH_TIMEOUT_MS || 20_000);
    this.maxRedirects = opts.maxRedirects ?? 5;
    this.maxBytes = opts.maxBytes ?? Number(process.env.FETCH_MAX_BYTES_HTML || 5 * 1024 * 1024);
  }

  /** Validate a URL without fetching it. Returns the pinned address. */
  async assertAllowed(rawUrl: string): Promise<{ url: URL; address: string }> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new SsrfError('Invalid URL', { url: rawUrl });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SsrfError(`Scheme not allowed: ${url.protocol}`);
    if (!ALLOWED_PORTS.has(url.port)) throw new SsrfError(`Port not allowed: ${url.port}`);
    if (url.username || url.password) throw new SsrfError('Credentials in URL not allowed');

    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) throw new SsrfError('IP-literal hosts are not allowed', { host: hostname });
    const host = hostOf(url.toString());
    if (!(await this.opts.hostPolicy(host))) throw new SsrfError(`Host is not an approved source domain: ${host}`, { host });

    let addresses: string[];
    try {
      addresses = await this.resolver(hostname);
    } catch (err) {
      throw new RetryableError(`DNS resolution failed for ${host}`, 'dns_failure', { host, cause: (err as Error).message });
    }
    if (addresses.length === 0) throw new RetryableError(`No DNS records for ${host}`, 'dns_failure', { host });
    const blocked = addresses.filter((a) => !isPublicAddress(a));
    if (blocked.length > 0) throw new SsrfError(`Host resolves to a non-public address`, { host, blocked });
    return { url, address: addresses[0] };
  }

  async fetch(req: SafeFetchRequest): Promise<SafeFetchResponse> {
    const redirects: string[] = [];
    let current = req.url;
    const maxBytes = req.maxBytes ?? this.maxBytes;

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const { url, address } = await this.assertAllowed(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          'user-agent': this.userAgent,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.5',
          'accept-encoding': 'gzip, deflate, br',
          ...req.headers,
        };
        if (hop === 0 && req.etag) headers['if-none-match'] = req.etag;
        if (hop === 0 && req.lastModified) headers['if-modified-since'] = req.lastModified;

        let res: TransportResponse | undefined;
        try {
          res = await this.transport({ url, address, headers, timeoutMs: this.timeoutMs, signal: controller.signal });
        } catch (err) {
          if (controller.signal.aborted) throw new RetryableError(`Timeout fetching ${url.host}`, 'timeout');
          throw new RetryableError(`Network error fetching ${url.host}: ${(err as Error).message}`, 'network');
        }
        try {
          if (REDIRECT_STATUSES.has(res.status)) {
            const location = res.headers.get('location');
            await drain(res.body);
            if (!location) throw new TerminalError('Redirect without Location', 'bad_redirect');
            current = new URL(location, url).toString();
            redirects.push(current);
            continue;
          }

          if (res.status === 304) {
            await drain(res.body);
            return this.result(req.url, url.toString(), redirects, res, Buffer.alloc(0), true);
          }
          if (res.status === 401 || res.status === 403 || res.status === 451) {
            await drain(res.body);
            throw new BlockedError(`Access restricted (${res.status}) at ${url.host}`, 'http_blocked', { status: res.status });
          }
          if (res.status === 429 || res.status >= 500) {
            await drain(res.body);
            throw new RetryableError(`Upstream ${res.status} at ${url.host}`, 'upstream_unavailable', { status: res.status });
          }
          if (res.status >= 400) {
            await drain(res.body);
            throw new TerminalError(`Upstream ${res.status} at ${url.host}`, 'http_error', { status: res.status });
          }

          const declared = Number(res.headers.get('content-length') || 0);
          if (declared > maxBytes) {
            await drain(res.body);
            throw new TerminalError(`Response too large (${declared} bytes)`, 'response_too_large');
          }
          const body = await readCapped(res.body, maxBytes, controller);
          return this.result(req.url, url.toString(), redirects, res, body, false);
        } finally {
          await res.close?.().catch(() => undefined);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new TerminalError(`Too many redirects from ${req.url}`, 'too_many_redirects');
  }

  private result(requestedUrl: string, finalUrl: string, redirects: string[], res: TransportResponse, body: Buffer, notModified: boolean): SafeFetchResponse {
    return {
      requestedUrl,
      finalUrl,
      redirects,
      status: res.status,
      notModified,
      headers: res.headers,
      body,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      contentType: res.headers.get('content-type'),
    };
  }
}

async function readCapped(body: AsyncIterable<Uint8Array> | null, maxBytes: number, controller: AbortController): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      controller.abort();
      throw new TerminalError(`Response exceeded ${maxBytes} bytes`, 'response_too_large');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function drain(body: AsyncIterable<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    for await (const _ of body) {
      /* discard */
    }
  } catch {
    /* ignore */
  }
}

/** Real transport: undici with the connection pinned to the validated address. */
export const undiciTransport: Transport = async ({ url, address, headers, signal }) => {
  const family = isIP(address) === 6 ? 6 : 4;
  const dispatcher = new Agent({
    connect: {
      // Pin the socket to the address that passed the SSRF check.
      lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) =>
        opts?.all ? cb(null, [{ address, family }]) : cb(null, address, family)) as any,
    },
  });
  try {
    const res = await undiciFetch(url, { headers, redirect: 'manual', signal, dispatcher });
    const body = res.body as unknown as AsyncIterable<Uint8Array> | null;
    return { status: res.status, headers: res.headers as unknown as Headers, body, close: () => dispatcher.close() };
  } catch (err) {
    await dispatcher.close().catch(() => undefined);
    throw err;
  }
};
