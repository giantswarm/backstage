/** How long a usage answer is reused: the frontend's own `staleTime`. */
export const USAGE_CACHE_TTL_MS = 5 * 60_000;

/** Entries kept at most; the oldest go first beyond it. */
const USAGE_CACHE_MAX_ENTRIES = 500;

/**
 * The cache key of one usage read.
 *
 * It carries the Backstage user the request was authenticated as: a hit
 * answers without muster seeing the request, so it may only answer someone
 * muster already answered. The forwarded muster token cannot stand in for
 * them: the frontend gets a new ID token on every full load, and
 * `readCallOptions` checks its presence and expiry, not who it names. A
 * person whose access muster withdraws keeps the cached answer for up to
 * {@link USAGE_CACHE_TTL_MS}, as their browser keeps its own for as long.
 */
export function usageCacheKey(parts: {
  route: string;
  installation: string;
  hours: number;
  servers: readonly string[];
  tool?: string;
  userEntityRef: string;
}): string {
  return JSON.stringify([
    parts.route,
    parts.installation,
    parts.hours,
    [...new Set(parts.servers)].sort(),
    parts.tool ?? null,
    parts.userEntityRef,
  ]);
}

/**
 * Usage answers by key, reused for {@link USAGE_CACHE_TTL_MS}, and one load
 * per key at a time: requests for a key whose load is running wait for it.
 * Only answers `keep` accepts are stored; a failed load is not, and every
 * waiter sees its error. Without a key nothing is shared: `load` runs.
 *
 * Not `coreServices.cache`: that stores serialised values with no way to
 * share a load in flight, which is most of what this saves when a page asks
 * for the same window twice; the answers are per process and short-lived.
 */
export class UsageCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  read(
    key: string | undefined,
    load: () => Promise<T>,
    keep: (value: T) => boolean,
  ): Promise<T> {
    if (key === undefined) {
      return load();
    }
    const entry = this.entries.get(key);
    if (entry && entry.expires > Date.now()) {
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

  /** Drops the answer stored under `key`, if any. */
  forget(key: string | undefined) {
    if (key !== undefined) {
      this.entries.delete(key);
    }
  }

  private store(key: string, value: T) {
    const now = Date.now();
    for (const [stored, entry] of this.entries) {
      if (entry.expires <= now) {
        this.entries.delete(stored);
      }
    }
    this.entries.delete(key);
    this.entries.set(key, { value, expires: now + USAGE_CACHE_TTL_MS });
    while (this.entries.size > USAGE_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
