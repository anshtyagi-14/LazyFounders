/**
 * robots.txt handling per RFC 9309:
 *  - 2xx: parse and obey the group for our user agent (or "*").
 *  - 4xx: no restrictions.
 *  - 5xx / unreachable: assume full disallow ("fail closed") when the source requires robots.
 * Crawl-delay is exposed so the caller can feed it into the rate limiter.
 */
export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

export interface RobotsPolicy {
  status: 'parsed' | 'none' | 'unreachable';
  rules: RobotsRules;
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const token = userAgent.toLowerCase().split('/')[0];
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[]; delay: number | null }> = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.allow.push(value);
    else if (key === 'disallow' && value) current.disallow.push(value);
    else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    crawlDelaySeconds: chosen.reduce<number | null>((d, g) => (g.delay != null ? Math.max(d ?? 0, g.delay) : d), null),
    sitemaps,
  };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** Longest matching rule wins; on a tie, allow wins. */
export function isPathAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const [list, allow] of [[rules.allow, true], [rules.disallow, false]] as const) {
    for (const p of list) {
      if (patternToRegex(p).test(pathWithQuery)) {
        if (!best || p.length > best.len || (p.length === best.len && allow)) best = { len: p.length, allow };
      }
    }
  }
  return best ? best.allow : true;
}

export function isAllowedByPolicy(policy: RobotsPolicy, url: string, robotsRequired: boolean): boolean {
  if (policy.status === 'none') return true;
  if (policy.status === 'unreachable') return !robotsRequired;
  const u = new URL(url);
  return isPathAllowed(policy.rules, u.pathname + u.search);
}

export const EMPTY_RULES: RobotsRules = { allow: [], disallow: [], crawlDelaySeconds: null, sitemaps: [] };
