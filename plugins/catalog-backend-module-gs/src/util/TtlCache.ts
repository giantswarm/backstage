export type Cached<T> = {
  value: T;
  /** When the underlying lookup actually ran. */
  fetchedAt: number;
};

/**
 * TTL cache with in-flight dedup, as the release processors have: a lookup
 * runs at most once per TTL, and concurrent callers for the same key share the
 * one promise instead of each issuing a request. A rejected fill is not cached,
 * so a transient failure is retried on the next pass rather than held for the
 * whole TTL.
 *
 * Expired entries are dropped rather than left in place. Most caches here are
 * keyed by something fixed by the size of the fleet, where an expired entry is
 * overwritten on the next lookup anyway — but a cache keyed by something like
 * `registry/repository:tag` or a CI build URL gains a key per release or per
 * build that is never looked up again. Sweeping on fill keeps the key set
 * bounded by what is actually still in use.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, Cached<T>>();
  private readonly inflight = new Map<string, Promise<Cached<T>>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  /** Number of cached entries. For tests asserting the key set stays bounded. */
  get size(): number {
    return this.entries.size;
  }

  get(key: string, fill: () => Promise<T>): Promise<Cached<T>> {
    const cached = this.entries.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return Promise.resolve(cached);
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const pending = fill()
      .then(value => {
        const fresh: Cached<T> = { value, fetchedAt: Date.now() };
        this.entries.set(key, fresh);
        this.dropExpired();
        return fresh;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, pending);
    return pending;
  }

  private dropExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.fetchedAt >= this.ttlMs && !this.inflight.has(key)) {
        this.entries.delete(key);
      }
    }
  }
}
