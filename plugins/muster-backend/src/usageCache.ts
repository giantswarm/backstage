import { createHash } from 'node:crypto';

/** How long a usage answer is reused: the frontend's own `staleTime`. */
export const USAGE_CACHE_TTL_MS = 5 * 60_000;

/** Entries kept at most; the oldest go first beyond it. */
const USAGE_CACHE_MAX_ENTRIES = 500;

/**
 * The cache key of one usage read.
 *
 * The token is part of it, hashed: a hit answers without muster seeing the
 * request, so it may only answer a request muster already answered for the
 * same credential. Without it, one person's answer would reach anybody whose
 * token `readCallOptions` lets through, which checks presence and expiry, not
 * what muster would let them read.
 */
export function usageCacheKey(parts: {
  route: string;
  installation: string;
  hours: number;
  servers: readonly string[];
  tool?: string;
  authToken?: string;
}): string {
  const credential = parts.authToken
    ? createHash('sha256').update(parts.authToken).digest('hex')
    : '';
  return JSON.stringify([
    parts.route,
    parts.installation,
    parts.hours,
    [...new Set(parts.servers)].sort(),
    parts.tool ?? null,
    credential,
  ]);
}

/**
 * Usage answers by key, reused for {@link USAGE_CACHE_TTL_MS}, and one load
 * per key at a time: requests for a key whose load is running wait for it.
 * Only answers `keep` accepts are stored; a failed load is not, and every
 * waiter sees its error.
 */
export class UsageCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? USAGE_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  read(key: string, load: () => Promise<T>, keep: (value: T) => boolean) {
    const entry = this.entries.get(key);
    if (entry && entry.expires > this.now()) {
      return Promise.resolve(entry.value);
    }
    const running = this.inFlight.get(key);
    if (running) {
      return running;
    }
    const loading = load()
      .then(value => {
        if (keep(value)) {
          this.store(key, value);
        }
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, loading);
    return loading;
  }

  private store(key: string, value: T) {
    const now = this.now();
    for (const [stored, entry] of this.entries) {
      if (entry.expires <= now) {
        this.entries.delete(stored);
      }
    }
    this.entries.delete(key);
    this.entries.set(key, { value, expires: now + this.ttlMs });
    while (this.entries.size > USAGE_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
