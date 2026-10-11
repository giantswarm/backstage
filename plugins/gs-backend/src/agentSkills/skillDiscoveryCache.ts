import { LoggerService } from '@backstage/backend-plugin-api';
import {
  DiscoverAgentSkillsResult,
  GitHubApiError,
  SkillDiscoverySnapshot,
} from './discoverAgentSkills';
import { GitFetchError } from './discoverAgentSkillsFromGit';
import { CachedSkillFile, SkillFileCache } from './skillFileCache';
import { SkillFileList } from './skillFiles';

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
 * Repositories × refs remembered. Only configured repositories are read (the
 * route refuses others), a handful; the bound is for the refs a caller can
 * name.
 */
export const MAX_ENTRIES = 100;

/** A `SKILL.md` larger than this is not kept (its content is read live). */
export const MAX_KEPT_CONTENT_BYTES = 256 * 1024;

/**
 * Commits read outside a listing (an agent's older pin, a generic-git skill
 * read on a cache miss) whose file lists are remembered, per repository ×
 * commit.
 */
export const MAX_PINNED_ENTRIES = 20;

/** What a read outside a listing leaves to remember for a commit. */
export interface PinnedSkillFiles {
  /** Every skill's files at the commit, by skill path. */
  files: Map<string, SkillFileList>;
  /** Raw `SKILL.md`s read on the way, by skill path. */
  contents?: Map<string, string>;
  /** Small files read on the way, by repository-relative path. */
  fileContents?: Map<string, Uint8Array>;
  /**
   * True when `files` may lack skills (GitHub capped the tree): a skill
   * directory missing from it is then no proof that it has no `SKILL.md`.
   */
  truncated?: boolean;
}

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
 * - Keeps every skill's file list, and — in a size-capped LRU of small files
 *   (`SkillFileCache`) — file bytes a checkout scan read or a view fetched,
 *   so `GET /agent-skills/content/file` is mostly answered from memory.
 *
 * The listing is read with the portal's own credentials (the GitHub
 * integration's token, or an anonymous clone), never a person's, so one
 * cache serves everybody. It is per backend instance: replicas each keep
 * their own, at worst multiplying the upstream requests by the replica count.
 */
export class SkillDiscoveryCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<CachedDiscovery>>();
  /** File lists (and SKILL.mds) of commits read outside a listing. */
  private readonly pinned = new Map<
    string,
    {
      files: Map<string, SkillFileList>;
      contents: Map<string, string>;
      truncated: boolean;
    }
  >();
  private readonly fileCache: SkillFileCache;
  private readonly now: () => number;
  private readonly logger?: LoggerService;

  constructor(
    options: {
      now?: () => number;
      logger?: LoggerService;
      fileCache?: SkillFileCache;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.logger = options.logger;
    this.fileCache = options.fileCache ?? new SkillFileCache();
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
    const raw = this.pinned.get(`${repoKey}#${commit}`)?.contents.get(path);
    return raw === undefined ? undefined : { raw, repoUrl };
  }

  /**
   * The files of the skill at `path` of `repoUrl` at `commit`, when a listing
   * at that commit (or a read outside one, see {@link rememberPinned}) has
   * them — a file list at a commit never changes either.
   */
  readSkillFiles(
    repoUrl: string,
    path: string,
    commit: string,
  ): SkillFileList | undefined {
    const repoKey = repositoryKey(repoUrl);
    for (const entry of this.entries.values()) {
      const snapshot = entry.snapshot;
      if (entry.repoKey !== repoKey || snapshot?.commit !== commit) {
        continue;
      }
      const list = snapshot.files?.get(path);
      if (list) {
        return list;
      }
    }
    return this.pinned.get(`${repoKey}#${commit}`)?.files.get(path);
  }

  /**
   * Whether every skill's file list of `repoUrl` at `commit` is known — from
   * a listing at that commit, or a read outside one — so that a skill or file
   * missing from it would be missing again from a fresh read upstream (the
   * tree at a commit never changes). `undefined` when no read covered the
   * commit. `truncated` is true when GitHub capped the tree those lists come
   * from: a `SKILL.md` outside it may still exist.
   */
  knownCommit(
    repoUrl: string,
    commit: string,
  ): { truncated: boolean } | undefined {
    const repoKey = repositoryKey(repoUrl);
    let known: { truncated: boolean } | undefined;
    for (const entry of this.entries.values()) {
      const snapshot = entry.snapshot;
      if (
        entry.repoKey === repoKey &&
        snapshot?.commit === commit &&
        snapshot.files
      ) {
        if (!snapshot.truncated) {
          return { truncated: false };
        }
        known = { truncated: true };
      }
    }
    const pinned = this.pinned.get(`${repoKey}#${commit}`);
    if (pinned && !pinned.truncated) {
      return { truncated: false };
    }
    return pinned ? { truncated: true } : known;
  }

  /**
   * Remembers what a read outside a listing found at `commit`: the file
   * lists (bounded to {@link MAX_PINNED_ENTRIES} commits, least recently
   * remembered dropped first), the small `SKILL.md`s, and any file bytes —
   * those go to the size-capped file cache.
   */
  rememberPinned(
    repoUrl: string,
    commit: string,
    read: PinnedSkillFiles,
  ): void {
    const repoKey = repositoryKey(repoUrl);
    const key = `${repoKey}#${commit}`;
    this.pinned.delete(key);
    this.pinned.set(key, {
      files: read.files,
      contents: smallContents(read.contents ?? new Map()),
      truncated: read.truncated ?? false,
    });
    while (this.pinned.size > MAX_PINNED_ENTRIES) {
      this.pinned.delete(this.pinned.keys().next().value as string);
    }
    this.keepFileContents(repoKey, commit, read.fileContents);
  }

  /**
   * A file of `repoUrl` at `commit` (`filePath` repository-relative) the
   * file cache holds — read by a listing's checkout scan or an earlier view.
   */
  readFile(
    repoUrl: string,
    commit: string,
    filePath: string,
  ): CachedSkillFile | undefined {
    return this.fileCache.get(
      fileKey(repositoryKey(repoUrl), commit, filePath),
    );
  }

  /** Keeps a file read upstream; returns what the cache made of it. */
  rememberFile(
    repoUrl: string,
    commit: string,
    filePath: string,
    bytes: Uint8Array,
  ): CachedSkillFile {
    return this.fileCache.put(
      fileKey(repositoryKey(repoUrl), commit, filePath),
      bytes,
    );
  }

  private keepFileContents(
    repoKey: string,
    commit: string,
    fileContents: Map<string, Uint8Array> | undefined,
  ): void {
    for (const [filePath, bytes] of fileContents ?? []) {
      this.fileCache.put(fileKey(repoKey, commit, filePath), bytes);
    }
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
      const loaded = await load(previous?.snapshot);
      this.keepFileContents(repoKey, loaded.commit, loaded.fileContents);
      const snapshot = keepSmallContents(loaded);
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
    const {
      contents: _contents,
      files: _files,
      fileContents: _fileContents,
      ...result
    } = entry.snapshot!;
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
      this.entries.delete(this.evictionCandidate());
    }
  }

  /**
   * The entry to drop when full, oldest first within each class: a
   * remembered failure, then a listing at an explicit ref, and only then a
   * default-branch listing — what the portal shows. Callers can name refs
   * freely, so a flood of them never pushes the configured repositories'
   * listings out.
   */
  private evictionCandidate(): string {
    let explicitRef: string | undefined;
    for (const [key, entry] of this.entries) {
      if (!entry.snapshot) {
        return key;
      }
      if (explicitRef === undefined && key !== `${entry.repoKey}#`) {
        explicitRef = key;
      }
    }
    return explicitRef ?? (this.entries.keys().next().value as string);
  }
}

/** The file cache's key for a repository-relative path at a commit. */
function fileKey(repoKey: string, commit: string, filePath: string): string {
  return `${repoKey}#${commit}#${filePath}`;
}

/** The `SKILL.md`s small enough to keep. */
function smallContents(contents: Map<string, string>): Map<string, string> {
  const kept = new Map<string, string>();
  for (const [path, raw] of contents) {
    if (Buffer.byteLength(raw, 'utf8') <= MAX_KEPT_CONTENT_BYTES) {
      kept.set(path, raw);
    }
  }
  return kept;
}

/**
 * Drops the `SKILL.md`s too large to keep (their content is then read live)
 * and the file bytes, which live in the file cache instead.
 */
function keepSmallContents(
  snapshot: SkillDiscoverySnapshot,
): SkillDiscoverySnapshot {
  const { fileContents: _fileContents, ...rest } = snapshot;
  return { ...rest, contents: smallContents(snapshot.contents) };
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
