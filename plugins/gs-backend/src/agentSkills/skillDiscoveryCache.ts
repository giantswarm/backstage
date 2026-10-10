import { LoggerService } from '@backstage/backend-plugin-api';
import {
  DiscoverAgentSkillsResult,
  GitHubApiError,
  SkillDiscoverySnapshot,
} from './discoverAgentSkills';
import { GitFetchError } from './discoverAgentSkillsFromGit';

/**
 * How long a discovered listing is served without asking upstream again.
 * Skills change rarely (a merged pull request), and every GitHub discovery
 * costs 3 + one request per skill — the reason the skill overview ran into
 * GitHub's rate limit when each page view discovered afresh.
 */
export const DISCOVERY_TTL_MS = 10 * 60 * 1000;

/**
 * A listing with an unreadable skill (a `SKILL.md` read refused mid-run) is
 * revalidated sooner; the revalidation retries only those reads while the
 * ref still points at the same commit.
 */
export const UNREADABLE_RETRY_MS = 2 * 60 * 1000;

/**
 * After a failed refresh, how long the cache answers from what it has (the
 * stale listing, or the failure) before asking upstream again — unless
 * GitHub named a later time to retry.
 */
export const FAILURE_BACKOFF_MS = 60 * 1000;

/** A rate limit's retry time is believed up to this far ahead. */
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/** How old a listing may get and still be served when upstream fails. */
export const MAX_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Repositories × refs remembered. The configured repositories are a handful;
 * the bound is for ad-hoc github.com repositories a caller names.
 */
export const MAX_ENTRIES = 100;

/** A `SKILL.md` larger than this is not kept (its content is read live). */
export const MAX_KEPT_CONTENT_BYTES = 256 * 1024;

/**
 * The repository part of a cache key: trimmed, no trailing slash or `.git`,
 * case-folded — the comparison the configured-repository check makes.
 */
export function repositoryKey(repoUrl: string): string {
  return repoUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

/**
 * Whether a failed discovery is upstream being unavailable for now — a rate
 * limit, a 5xx, the host unreachable — as opposed to an answer (the
 * repository or ref does not exist, access was refused) that a stale listing
 * must not paper over.
 */
export function isTransientDiscoveryError(error: unknown): boolean {
  if (error instanceof GitHubApiError) {
    return error.rateLimited || error.status >= 500;
  }
  if (error instanceof GitFetchError) {
    return error.status === 429 || error.status >= 500;
  }
  if ((error as Error | undefined)?.name === 'InputError') {
    return false;
  }
  // A network failure (fetch's TypeError, a reset connection).
  return true;
}

interface Entry {
  repoKey: string;
  /** The last listing read, when there is one to serve. */
  snapshot?: SkillDiscoverySnapshot;
  /** When `snapshot` was read (epoch ms). */
  readAt: number;
  /** No upstream request for this key before this time (epoch ms). */
  freshUntil: number;
  /** The last refresh's failure, served while there is no snapshot. */
  failure?: unknown;
}

/** A listing as the route answers it. */
export interface CachedDiscovery {
  result: DiscoverAgentSkillsResult;
  /** When the listing was read upstream (epoch ms). */
  readAt: number;
  /**
   * True when upstream could not be asked or answered with a rate limit or
   * outage, and an older listing is served instead.
   */
  stale: boolean;
}

/**
 * The skill listing per repository and ref, in memory: what `GET
 * /agent-skills` answers from, so a page view does not cost GitHub requests.
 *
 * - Fresh for {@link DISCOVERY_TTL_MS}; then the next request revalidates,
 *   handing the provider the previous snapshot so an unchanged ref costs no
 *   tree or file reads. Concurrent requests share one refresh.
 * - Serve-stale: a refresh refused by a rate limit, a 5xx or a network
 *   failure answers the previous listing (up to {@link MAX_STALE_MS} old),
 *   and upstream is not asked again before GitHub's retry time (or
 *   {@link FAILURE_BACKOFF_MS}). A definite answer (404, access refused)
 *   drops the listing and is forwarded.
 * - Keeps every `SKILL.md` discovery read, so `GET /agent-skills/content`
 *   answers a skill at the commit listed without another request.
 *
 * The listing is read with the portal's own credentials (the GitHub
 * integration's token, or an anonymous clone), never a person's, so one
 * cache serves everybody. It is per backend instance: replicas each keep
 * their own, at worst multiplying the upstream requests by the replica count.
 */
export class SkillDiscoveryCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<CachedDiscovery>>();
  private readonly now: () => number;
  private readonly logger?: LoggerService;

  constructor(options: { now?: () => number; logger?: LoggerService } = {}) {
    this.now = options.now ?? Date.now;
    this.logger = options.logger;
  }

  /**
   * The listing of `repoUrl` at `ref` (the default branch when absent),
   * from memory when fresh, else through `load` — which receives the previous
   * snapshot to reuse what it can.
   */
  async discover(
    repoUrl: string,
    ref: string | undefined,
    load: (
      previous?: SkillDiscoverySnapshot,
    ) => Promise<SkillDiscoverySnapshot>,
  ): Promise<CachedDiscovery> {
    const repoKey = repositoryKey(repoUrl);
    const key = `${repoKey}#${ref ?? ''}`;
    const entry = this.entries.get(key);
    if (entry && this.now() < entry.freshUntil) {
      if (entry.snapshot) {
        return this.answer(entry);
      }
      throw entry.failure;
    }

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.refresh(key, repoKey, entry, load).finally(() => {
        this.inflight.delete(key);
      });
      this.inflight.set(key, pending);
    }
    return pending;
  }

  /**
   * The raw `SKILL.md` of the skill at `path` of `repoUrl`, when a listing
   * at `commit` read it — content at a commit never changes, so a stale
   * listing's file is as good as a fresh one.
   */
  readContent(
    repoUrl: string,
    path: string,
    commit: string,
  ): { raw: string; repoUrl: string } | undefined {
    const repoKey = repositoryKey(repoUrl);
    for (const entry of this.entries.values()) {
      const snapshot = entry.snapshot;
      if (entry.repoKey !== repoKey || snapshot?.commit !== commit) {
        continue;
      }
      const raw = snapshot.contents.get(path);
      const skill = snapshot.skills.find(s => s.path === path);
      if (raw !== undefined && skill?.contentReadable) {
        return { raw, repoUrl: skill.repoUrl };
      }
    }
    return undefined;
  }

  private async refresh(
    key: string,
    repoKey: string,
    previous: Entry | undefined,
    load: (
      previous?: SkillDiscoverySnapshot,
    ) => Promise<SkillDiscoverySnapshot>,
  ): Promise<CachedDiscovery> {
    try {
      const snapshot = keepSmallContents(await load(previous?.snapshot));
      const readAt = this.now();
      const retrySoon = snapshot.skills.some(s => !s.contentReadable);
      const entry: Entry = {
        repoKey,
        snapshot,
        readAt,
        freshUntil:
          readAt + (retrySoon ? UNREADABLE_RETRY_MS : DISCOVERY_TTL_MS),
      };
      this.store(key, entry);
      return this.answer(entry);
    } catch (error) {
      const now = this.now();
      const freshUntil = backoffUntil(error, now);
      if (
        isTransientDiscoveryError(error) &&
        previous?.snapshot &&
        now - previous.readAt <= MAX_STALE_MS
      ) {
        this.logger?.info(
          'Skill discovery failed upstream; serving the last listing',
          {
            repository: repoKey,
            readAt: new Date(previous.readAt).toISOString(),
            error: (error as Error)?.message,
          },
        );
        const entry: Entry = { ...previous, freshUntil, failure: undefined };
        this.store(key, entry);
        return this.answer(entry);
      }
      // Nothing to fall back on (or a definite answer): remember the failure
      // briefly so a burst of page views does not each ask again.
      this.store(key, { repoKey, readAt: now, freshUntil, failure: error });
      throw error;
    }
  }

  private answer(entry: Entry): CachedDiscovery {
    const { contents: _contents, ...result } = entry.snapshot!;
    return {
      result,
      readAt: entry.readAt,
      stale: this.now() - entry.readAt >= DISCOVERY_TTL_MS,
    };
  }

  private store(key: string, entry: Entry): void {
    // Re-inserting moves the key to the end: the first key is the one
    // refreshed longest ago, evicted first.
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }
}

/** Drops the files too large to keep; their content is then read live. */
function keepSmallContents(
  snapshot: SkillDiscoverySnapshot,
): SkillDiscoverySnapshot {
  const contents = new Map<string, string>();
  for (const [path, raw] of snapshot.contents) {
    if (Buffer.byteLength(raw, 'utf8') <= MAX_KEPT_CONTENT_BYTES) {
      contents.set(path, raw);
    }
  }
  return { ...snapshot, contents };
}

/** When to ask upstream again after `error`. */
function backoffUntil(error: unknown, now: number): number {
  const named =
    error instanceof GitHubApiError ? error.rateLimit?.retryAt : undefined;
  const floor = now + FAILURE_BACKOFF_MS;
  if (named === undefined || named <= floor) {
    return floor;
  }
  return Math.min(named, now + MAX_BACKOFF_MS);
}
