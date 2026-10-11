import { GitHubApiError } from './discoverAgentSkills';
import { GitFetchError } from './discoverAgentSkillsFromGit';

/**
 * How long a definite upstream miss for a read at a commit (see
 * {@link isDefiniteMiss}) is answered from memory. Content at a commit never
 * changes, so a commit that is not there stays not there; the TTL only bounds
 * how long a branch reset back onto a once-moved-on commit (a 409) or a newly
 * granted repository access (a 404) goes unnoticed.
 */
export const MISS_TTL_MS = 5 * 60 * 1000;

/** Misses remembered, least recently remembered dropped first. */
export const MAX_MISS_ENTRIES = 1000;

/**
 * Upstream reads running at once, per pool. A generic-git read is a depth-1
 * clone into the temp directory plus a scan, so it gets the smaller budget; a
 * GitHub read spends the integration token the catalog and the scaffolder use
 * too.
 */
export const MAX_CONCURRENT_READS = { clone: 2, github: 4 } as const;

/**
 * Reads waiting for a slot, per pool. Past it a read is refused at once
 * (503) instead of queueing without bound behind a flood.
 */
export const MAX_QUEUED_READS = 32;

export type UpstreamPool = keyof typeof MAX_CONCURRENT_READS;

/**
 * Whether a failed read is a definite answer that will not change for the
 * same key: not found (404), unprocessable (422, GitHub's answer to a commit
 * id it cannot resolve), or the branch moved on from the commit (409). Rate
 * limits, 5xx and network failures are transient and never remembered.
 */
export function isDefiniteMiss(error: unknown): boolean {
  if (error instanceof GitHubApiError) {
    return !error.rateLimited && (error.status === 404 || error.status === 422);
  }
  if (error instanceof GitFetchError) {
    return error.status === 404 || error.status === 409;
  }
  return false;
}

/** A counting semaphore with a bounded wait queue. */
class ConcurrencyLimit {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly max: number,
    private readonly maxQueued: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.waiting.length >= this.maxQueued) {
        throw new GitFetchError(
          503,
          'Too many skill reads are in progress. Try again in a moment.',
        );
      }
      await new Promise<void>(resolve => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        // The slot passes straight to the next read; `active` stays.
        next();
      } else {
        this.active -= 1;
      }
    }
  }
}

/**
 * The gate every skill read at a caller-named commit goes through on a cache
 * miss (security audit 1, M2), so random commit ids cannot make the backend
 * clone or spend the GitHub token without bound:
 *
 * - **Negative cache:** a definite miss ({@link isDefiniteMiss}) is answered
 *   from memory for {@link MISS_TTL_MS}, per key.
 * - **In-flight de-dupe:** concurrent reads of one key share one upstream
 *   read.
 * - **Concurrency cap:** at most {@link MAX_CONCURRENT_READS} reads per pool
 *   run at once, at most {@link MAX_QUEUED_READS} wait; past that a read is
 *   refused with a 503.
 *
 * A key names everything the outcome depends on (repository, commit and, as
 * the read needs, ref, path or file), so a miss is only replayed for the
 * same read.
 */
export class UpstreamReadGuard {
  private readonly misses = new Map<
    string,
    { error: unknown; until: number }
  >();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly limits: Record<UpstreamPool, ConcurrencyLimit>;
  private readonly now: () => number;

  constructor(
    options: {
      now?: () => number;
      maxConcurrent?: Partial<Record<UpstreamPool, number>>;
      maxQueued?: number;
    } = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    const maxQueued = options.maxQueued ?? MAX_QUEUED_READS;
    this.limits = {
      clone: new ConcurrencyLimit(
        options.maxConcurrent?.clone ?? MAX_CONCURRENT_READS.clone,
        maxQueued,
      ),
      github: new ConcurrencyLimit(
        options.maxConcurrent?.github ?? MAX_CONCURRENT_READS.github,
        maxQueued,
      ),
    };
  }

  /**
   * Runs `task` under the pool's concurrency cap only: for reads whose
   * outcome changes over time (a listing at a ref), which keep their own
   * de-dupe and failure backoff (`SkillDiscoveryCache`).
   */
  limit<T>(pool: UpstreamPool, task: () => Promise<T>): Promise<T> {
    return this.limits[pool].run(task);
  }

  /** Runs the read of `key` through all three gates (see the class). */
  read<T>(pool: UpstreamPool, key: string, task: () => Promise<T>): Promise<T> {
    const fullKey = `${pool}#${key}`;
    const miss = this.misses.get(fullKey);
    if (miss) {
      if (this.now() < miss.until) {
        return Promise.reject(miss.error);
      }
      this.misses.delete(fullKey);
    }

    const pending = this.inflight.get(fullKey) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }
    const started = this.limits[pool]
      .run(task)
      .catch(error => {
        if (isDefiniteMiss(error)) {
          this.rememberMiss(fullKey, error);
        }
        throw error;
      })
      .finally(() => this.inflight.delete(fullKey));
    this.inflight.set(fullKey, started);
    return started;
  }

  private rememberMiss(key: string, error: unknown): void {
    this.misses.delete(key);
    this.misses.set(key, { error, until: this.now() + MISS_TTL_MS });
    while (this.misses.size > MAX_MISS_ENTRIES) {
      this.misses.delete(this.misses.keys().next().value as string);
    }
  }
}
