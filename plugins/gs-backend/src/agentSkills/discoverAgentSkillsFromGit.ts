import fs from 'node:fs';
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import git, { HttpClient } from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { InputError } from '@backstage/errors';
import { createHash } from 'node:crypto';
import { parseFrontmatter } from './frontmatter';
import {
  DiscoveredSkill,
  RefKind,
  SkillDiscoverySnapshot,
} from './discoverAgentSkills';
import { pluginsOf } from './discoverPlugins';
import {
  assignSkillFiles,
  gitBlobSha,
  parseConfiguredRef,
  MAX_INLINE_FILE_BYTES,
  repositoryFilePath,
  SkillFileList,
} from './skillFiles';
import { shortSha } from '@giantswarm/backstage-plugin-gs-common';

/**
 * Discovery over the plain git protocol (smart HTTP), for skill repositories
 * that are not on github.com — a Gitea in a lab cluster, a `git http-backend`
 * container, any git host that serves `git clone` over http(s). It speaks the
 * same protocol an agent's boot-time skill fetch speaks (`git fetch` of a
 * commit), so a repository that is discoverable here is fetchable there, and
 * no REST API — and no API rate limit — is involved. GitHub repositories keep
 * going through {@link discoverAgentSkills} (the REST API answers without a
 * clone and with precise rate-limit wording); this module is the second
 * provider, not a replacement.
 */

/**
 * A failed git fetch, carrying the HTTP status to forward (404 for a missing
 * ref, the server's status for a refused clone, 502 when the server could not
 * be reached). Mirrors `GitHubApiError` so the route treats both providers'
 * expected failures the same way.
 */
export class GitFetchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitFetchError';
  }
}

const SKILL_FILE = 'SKILL.md';

/** What a clone resolved to: the ref read and its commit. */
export interface GitCloneResult {
  /** Full commit id HEAD pointed at — the pin an agent carries. */
  commit: string;
  /** The ref that was read (the remote's default branch when none given). */
  ref: string;
  /** What `ref` is; a branch when absent. */
  refKind?: RefKind;
}

/** A ref the server advertises, as `listServerRefs` answers it. */
export interface ServerRef {
  ref: string;
  oid: string;
  peeled?: string;
}

/** A full SHA-1 commit id: isomorphic-git fetches no SHA-256 one. */
const SHA1_RE = /^[0-9a-f]{40}$/;

/**
 * What a configured ref is on the server and what to fetch for it, by the
 * rules the GitHub provider applies (`githubRefKind`): a full commit id is
 * fetched as itself (the server must allow it, as GitHub and Gitea do);
 * `refs/heads/<name>` and `refs/tags/<name>` must be that branch or tag; a
 * plain name must be exactly one of them. Throws a `GitFetchError` for a
 * name that is both, a SHA-256 commit id and a ref the server does not have.
 */
export function classifyRemoteRef(
  refs: ServerRef[],
  ref: string,
  repoUrl: string,
): { kind: RefKind; fetchRef: string; oid: string } {
  const { form, name } = parseConfiguredRef(ref);
  if (form === 'commit') {
    if (!SHA1_RE.test(name)) {
      throw new GitFetchError(
        400,
        `Ref ${ref} is a SHA-256 commit id, which is not supported for ${repoUrl}; configure a branch or tag.`,
      );
    }
    return { kind: 'commit', fetchRef: name, oid: name };
  }
  const byName = new Map(refs.map(r => [r.ref, r] as const));
  const branch = form === 'tag' ? undefined : byName.get(`refs/heads/${name}`);
  const tag = form === 'branch' ? undefined : byName.get(`refs/tags/${name}`);
  if (branch && tag) {
    throw new GitFetchError(
      422,
      `Ref ${ref} is both a branch and a tag of ${repoUrl}: configure refs/heads/${name} or refs/tags/${name}.`,
    );
  }
  if (branch) {
    return { kind: 'branch', fetchRef: branch.ref, oid: branch.oid };
  }
  if (tag) {
    // An annotated tag's commit is its peeled id.
    const peeled = tag.peeled ?? byName.get(`${tag.ref}^{}`)?.oid;
    return { kind: 'tag', fetchRef: tag.ref, oid: peeled ?? tag.oid };
  }
  throw new GitFetchError(
    404,
    `Ref ${ref} is not a branch, tag or full commit id of ${repoUrl}.`,
  );
}

/**
 * The network half of discovery, injectable so tests exercise the scan and
 * the error mapping without a git server.
 */
export interface GitClient {
  /**
   * Clones `repoUrl` at `ref` (the default branch when absent), depth 1, into
   * `dir`, leaving a checked-out worktree there. `signal` aborting cancels
   * the clone's requests.
   */
  clone(
    dir: string,
    repoUrl: string,
    ref?: string,
    signal?: AbortSignal,
  ): Promise<GitCloneResult>;
}

/**
 * isomorphic-git's Node client with every request bound to `signal`:
 * `git.clone` takes no signal, but its client passes one to `http.request`,
 * which destroys the request — and a response being read — on abort.
 *
 * The response body is wrapped too. The client's body iterator passes a
 * stream error only to a read that is waiting at that moment. An abort that
 * lands while the clone is processing a chunk is dropped, and the next read
 * waits forever for an end a destroyed response never sends. The clone would
 * then never settle, and its checkout would never be removed. Every read
 * therefore races the signal and fails at once after the abort.
 */
export function abortableHttp(signal: AbortSignal): HttpClient {
  return {
    async request(request) {
      const response = await http.request({ ...request, signal });
      return response.body
        ? { ...response, body: abortableBody(response.body, signal) }
        : response;
    },
  };
}

/** `body`, each read rejecting with the abort reason once `signal` aborts. */
function abortableBody(
  body: AsyncIterableIterator<Uint8Array>,
  signal: AbortSignal,
): AsyncIterableIterator<Uint8Array> {
  const reads = body[Symbol.asyncIterator]();
  return {
    next: () => untilAborted(reads.next(), signal),
    async return(value?: unknown) {
      // Releases the response stream, as the client's own iterator does.
      await reads.return?.(value);
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/** The real client: isomorphic-git over Node's http(s), no git binary. */
const isomorphicGitClient: GitClient = {
  async clone(dir, repoUrl, ref, signal) {
    const client = signal ? abortableHttp(signal) : http;
    // A commit id or a branch named in full is fetched at once; a plain name
    // or a tag is looked up in the server's refs first (one more round trip),
    // which a plain name needs to tell a branch from a tag of the same name.
    const configured = ref ? parseConfiguredRef(ref) : undefined;
    let target: { kind: RefKind; fetchRef: string; oid?: string } | undefined;
    if (ref && configured?.form === 'commit') {
      target = classifyRemoteRef([], ref, repoUrl);
    } else if (ref && configured?.form === 'branch') {
      target = { kind: 'branch', fetchRef: ref };
    } else if (ref) {
      target = classifyRemoteRef(
        await git.listServerRefs({
          http: client,
          url: repoUrl,
          protocolVersion: 1,
          peelTags: true,
        }),
        ref,
        repoUrl,
      );
    }
    if (ref && target && (target.kind !== 'branch' || !target.oid)) {
      // Exactly that ref, depth 1, checked out detached: `git.clone` resolves
      // a short name tag-first and only checks out branches.
      await git.init({ fs, dir });
      await git.addRemote({ fs, dir, remote: 'origin', url: repoUrl });
      const { fetchHead } = await git.fetch({
        fs,
        http: client,
        dir,
        remote: 'origin',
        ref: target.fetchRef,
        singleBranch: true,
        depth: 1,
        tags: false,
      });
      const oid = target.oid ?? fetchHead;
      if (!oid) {
        throw new GitFetchError(
          404,
          `Ref ${ref} is not a branch of ${repoUrl}.`,
        );
      }
      await git.checkout({ fs, dir, ref: oid, force: true });
      const commit = await git.resolveRef({ fs, dir, ref: 'HEAD' });
      return { commit, ref, refKind: target.kind };
    }
    await git.clone({
      fs,
      http: client,
      dir,
      url: repoUrl,
      ref: ref || undefined,
      singleBranch: true,
      depth: 1,
      noTags: true,
    });
    const commit = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    // `||`, not `??`: an empty ref reads the default branch, and the listing
    // must name that branch, never ''.
    const branch =
      ref || (await git.currentBranch({ fs, dir, fullname: false })) || 'HEAD';
    return { commit, ref: branch, refKind: 'branch' };
  },
};

/** Why an aborted read stopped: the signal's reason, else a 504. */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason instanceof Error
    ? signal.reason
    : new GitFetchError(504, 'The git read was cancelled.');
}

/** `work`, or the abort reason as soon as `signal` aborts, whichever first. */
function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return work;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Clones `repoUrl` at `ref` into a fresh temporary directory and hands it to
 * `use`. The directory is removed once the clone has settled, however the
 * read ends. When `signal` aborts mid-clone the caller is answered at once
 * and the abandoned clone's directory goes when the clone stops — promptly
 * with the real client, whose requests abort with the signal — so the
 * checkout never outlives the clone writing into it, nor leaks.
 */
async function withClone<T>(
  options: {
    gitClient: GitClient;
    repoUrl: string;
    ref: string | undefined;
    signal?: AbortSignal;
  },
  use: (dir: string, cloned: GitCloneResult) => Promise<T>,
): Promise<T> {
  const { gitClient, repoUrl, ref, signal } = options;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-skills-'));
  const removeDir = () => rm(dir, { recursive: true, force: true });
  let cloneSettled = false;
  const cloning = (async () => gitClient.clone(dir, repoUrl, ref, signal))();
  const settled = cloning.then(
    () => {
      cloneSettled = true;
    },
    () => {
      cloneSettled = true;
    },
  );
  try {
    let cloned: GitCloneResult;
    try {
      cloned = await untilAborted(cloning, signal);
    } catch (error) {
      throw toGitFetchError(error, repoUrl, ref);
    }
    return await use(dir, cloned);
  } finally {
    if (cloneSettled) {
      await removeDir();
    } else {
      settled.then(removeDir).catch(() => undefined);
    }
  }
}

/**
 * Maps a clone failure to a `GitFetchError` whose status the route can
 * forward. isomorphic-git throws `NotFoundError` for a ref the remote does
 * not have and `HttpError` (with the upstream status) for a refused request;
 * anything else — DNS, a connection refused — is the server being
 * unreachable, a 502.
 */
export function toGitFetchError(
  error: unknown,
  repoUrl: string,
  ref: string | undefined,
): GitFetchError {
  if (error instanceof GitFetchError) {
    return error;
  }
  const e = error as {
    code?: string;
    message?: string;
    data?: { statusCode?: number };
  };
  if (e?.code === 'NotFoundError') {
    return new GitFetchError(
      404,
      `${ref ? `Ref ${ref}` : 'The default branch'} was not found in ${repoUrl}: ${e.message}`,
    );
  }
  const status = e?.data?.statusCode;
  if (typeof status === 'number') {
    // Over the git protocol GitHub (and Gitea) answer 401 for a repository
    // that is missing *or* private, to not reveal which; say both.
    const hint =
      status === 401 || status === 403
        ? ' (the repository does not exist, or is private and the fetch was anonymous)'
        : '';
    return new GitFetchError(
      status,
      `Git fetch of ${repoUrl} was refused with HTTP ${status}${hint}`,
    );
  }
  return new GitFetchError(
    502,
    `Could not fetch ${repoUrl} over git: ${e?.message ?? String(error)}`,
  );
}

/** A `SKILL.md` found in a checkout, parsed but without the repo fields. */
export interface ScannedSkill {
  /** Skill root directory relative to the repo root; '' at the root. */
  path: string;
  /** Frontmatter `name`, when present. */
  name?: string;
  /** Frontmatter `description`, when present. */
  description?: string;
  /** Frontmatter `metadata.tags`, parsed; empty when absent. */
  tags: string[];
  /** The raw `SKILL.md`. */
  content: string;
}

/** A regular file found in a checkout. */
interface ScannedFile {
  /** Relative to the repository root. */
  path: string;
  size: number;
}

/**
 * Walks a checkout: every `SKILL.md` (any depth, frontmatter parsed) and
 * every regular file. `.git` directories and symlinks are not descended into
 * or listed — the checkout is untrusted content, and a symlink must not walk
 * out of it.
 */
async function walkCheckout(
  rootDir: string,
  scanPath = '',
): Promise<{ skills: ScannedSkill[]; files: ScannedFile[] }> {
  const skills: ScannedSkill[] = [];
  const files: ScannedFile[] = [];

  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git') {
          continue;
        }
        await walk(entryPath, entryRel);
      } else if (entry.isFile()) {
        const { size } = await lstat(entryPath);
        files.push({ path: entryRel, size });
        if (entry.name === SKILL_FILE) {
          const content = await readFile(entryPath, 'utf8');
          const { name, description, tags } = parseFrontmatter(content);
          skills.push({ path: rel, name, description, tags, content });
        }
      }
    }
  }

  if (scanPath) {
    // Only below `scanPath`, still reported repository-relative; nothing
    // above it, plugin manifests included. A symlink on the way is not
    // followed, and a missing directory is a configuration error.
    let dir = rootDir;
    for (const segment of scanPath.split('/')) {
      dir = path.join(dir, segment);
      const stat = await lstat(dir).catch(() => undefined);
      if (!stat?.isDirectory()) {
        throw new GitFetchError(
          404,
          `${scanPath} does not exist in the repository.`,
        );
      }
    }
    await walk(dir, scanPath);
  } else {
    await walk(rootDir, '');
  }
  return { skills, files };
}

/**
 * Finds every `SKILL.md` under `rootDir` (any depth) and parses its
 * frontmatter. `.git` directories and symlinks are not descended into — the
 * checkout is untrusted content, and a symlink must not walk out of it.
 */
export async function scanSkillsTree(rootDir: string): Promise<ScannedSkill[]> {
  return (await walkCheckout(rootDir)).skills;
}

/**
 * The small listed files a checkout scan keeps the bytes of, at most: the
 * discovery cache holds them for the file viewer (whose own cap bounds the
 * whole), so a large repository cannot make one scan hold more than this.
 */
export const SCAN_KEPT_FILE_BYTES = 16 * 1024 * 1024;

/** The git blob id of a file too large to hold, hashed as a stream. */
async function streamGitBlobSha(file: string, size: number): Promise<string> {
  const hash = createHash('sha1').update(`blob ${size}\0`);
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

/**
 * Every skill's files in a checkout (see `assignSkillFiles`), with their git
 * blob ids, and the bytes of the small ones, up to
 * {@link SCAN_KEPT_FILE_BYTES} — plus `mustRead` (a repository-relative path)
 * whatever the budget, for a caller about to answer that very file. Only the
 * listed files (at most the per-skill cap) are read or hashed.
 */
async function listCheckoutFiles(
  root: string,
  skillDirs: string[],
  scanned: ScannedFile[],
  mustRead: string | undefined,
): Promise<{
  files: Map<string, SkillFileList>;
  fileContents: Map<string, Uint8Array>;
}> {
  const lists = assignSkillFiles(
    skillDirs,
    scanned.map(f => ({ path: f.path, size: f.size, sha: '' })),
  );
  const fileContents = new Map<string, Uint8Array>();
  let kept = 0;
  const files = new Map<string, SkillFileList>();
  for (const [dir, list] of lists) {
    const hashed = [];
    for (const file of list.files) {
      const repoPath = repositoryFilePath(dir, file.path);
      const absolute = path.join(root, ...repoPath.split('/'));
      if (file.size > MAX_INLINE_FILE_BYTES) {
        hashed.push({
          ...file,
          sha: await streamGitBlobSha(absolute, file.size),
        });
        continue;
      }
      const bytes = new Uint8Array(await readFile(absolute));
      hashed.push({ ...file, size: bytes.length, sha: gitBlobSha(bytes) });
      if (
        repoPath === mustRead ||
        kept + bytes.length <= SCAN_KEPT_FILE_BYTES
      ) {
        fileContents.set(repoPath, bytes);
        kept += bytes.length;
      }
    }
    files.set(dir, { ...list, files: hashed });
  }
  return { files, fileContents };
}

/** The 409 for a branch whose head is no longer the commit asked for. */
function movedOn(
  cloned: GitCloneResult,
  repoUrl: string,
  commit: string,
): GitFetchError {
  return new GitFetchError(
    409,
    `${cloned.ref} of ${repoUrl} has moved on from ${shortSha(commit)} to ${shortSha(cloned.commit)}; reload the skill to read its current version.`,
  );
}

/** The URL as the chart will carry it: trimmed, no trailing slashes. */
function canonicalGitUrl(repoUrl: string): string {
  return repoUrl.trim().replace(/\/+$/, '');
}

/** The repository's basename (`skills` for `https://host/x/skills.git`) —
 * the last name fallback when a root skill has no frontmatter name. */
function repoBasename(repoUrl: string): string {
  const last = repoUrl.split('/').filter(Boolean).pop() ?? '';
  return last.replace(/\.git$/i, '');
}

/**
 * Discovers agent skills in any http(s) git repository by cloning it (depth
 * 1, one branch, no tags — a skills repository is small) into a temporary
 * directory, finding every `SKILL.md` and reading its frontmatter. The result
 * has the exact shape of the GitHub discovery: every skill carries the head
 * commit the branch resolved to, so a picked skill pins to the commit that
 * was read. The clone is anonymous; a private repository refuses it (the
 * error says so).
 *
 * The same scan lists every skill's files (`files`) and keeps the bytes of
 * the small ones (`fileContents`) — the checkout is at hand, so the file
 * viewer is answered from memory rather than a clone per file.
 *
 * With `commit` the caller holds a pin and wants exactly it: the branch's
 * head must still be that commit (a 409 saying so otherwise; re-reading the
 * catalog picks up the new head) — how `/content` and `/content/file` read
 * a generic-git skill the cache does not hold. `mustRead` keeps that one
 * file's bytes whatever the scan's budget.
 */
export async function discoverAgentSkillsFromGit(options: {
  repoUrl: string;
  /** Branch (or tag) to read; defaults to the remote's default branch. */
  ref?: string;
  /** The commit the head must be; any head when absent. */
  commit?: string;
  /**
   * Directory to scan, repository-relative ('' or absent: the whole tree).
   * Skills keep their repository-relative paths.
   */
  scanPath?: string;
  /** A repository-relative file whose bytes to keep whatever the budget. */
  mustRead?: string;
  /** Aborts the clone (the read guard's deadline). */
  signal?: AbortSignal;
  /** Test seam; the real isomorphic-git client when absent. */
  gitClient?: GitClient;
}): Promise<SkillDiscoverySnapshot> {
  const { commit, mustRead, signal, gitClient = isomorphicGitClient } = options;
  // An empty ref is the default branch, as absent is.
  const ref = options.ref || undefined;
  const repoUrl = canonicalGitUrl(options.repoUrl);
  if (!/^https?:\/\//.test(repoUrl)) {
    throw new InputError(
      `Not an http(s) git repository URL: ${repoUrl} (expected http(s)://<host>/<path-to-repo>)`,
    );
  }

  return withClone({ gitClient, repoUrl, ref, signal }, async (dir, cloned) => {
    if (commit !== undefined && cloned.commit !== commit) {
      throw movedOn(cloned, repoUrl, commit);
    }

    // Said only for a configured ref; the default branch is a branch.
    const refKind = ref ? { refKind: cloned.refKind ?? 'branch' } : {};
    const walked = await walkCheckout(dir, options.scanPath ?? '');
    const scanned = walked.skills;
    const { files, fileContents } = await listCheckoutFiles(
      await realpath(dir),
      scanned.map(s => s.path),
      walked.files,
      mustRead,
    );
    const skills: DiscoveredSkill[] = scanned
      .map(s => ({
        name:
          s.name?.trim() ||
          s.path.split('/').pop() ||
          repoBasename(repoUrl) ||
          'skill',
        description: s.description?.trim() ?? '',
        tags: s.tags,
        repoUrl,
        path: s.path,
        ref: cloned.ref,
        ...refKind,
        commit: cloned.commit,
        // Read from the checkout just now.
        contentReadable: true,
        fileCount: files.get(s.path)?.total ?? 0,
      }))
      // Same stable order as the GitHub provider.
      .sort(
        (a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
      );

    return {
      skills,
      plugins: pluginsOf(
        walked.files.map(f => f.path),
        skills,
        {
          repoUrl,
          ref: cloned.ref,
          commit: cloned.commit,
          repoName: repoBasename(repoUrl),
        },
      ),
      ref: cloned.ref,
      ...refKind,
      commit: cloned.commit,
      // A full checkout was scanned; nothing can be missing.
      truncated: false,
      contents: new Map(scanned.map(s => [s.path, s.content])),
      files,
      fileContents,
    };
  });
}

/**
 * Reads one file of a skill repository at a commit, over the same depth-1
 * clone discovery makes: the branch is cloned and its head must still be the
 * commit asked for. Discovery pins every skill to the head it read, so the
 * commit a caller holds is that head unless the branch moved since — then the
 * answer is a 409 saying so (re-reading the catalog picks up the new head),
 * not a deeper fetch.
 *
 * `filePath` is relative to the repository root; the file must be a regular
 * file inside the checkout (no symlink out of it — the checkout is untrusted
 * content).
 */
export async function readFileFromGit(options: {
  repoUrl: string;
  /** The branch the commit is the head of; the default branch when absent. */
  ref?: string;
  /** The full commit id the file is read at. */
  commit: string;
  filePath: string;
  /** Aborts the clone. */
  signal?: AbortSignal;
  /** Test seam; the real isomorphic-git client when absent. */
  gitClient?: GitClient;
}): Promise<string> {
  const { commit, filePath, signal, gitClient = isomorphicGitClient } = options;
  const ref = options.ref || undefined;
  const repoUrl = canonicalGitUrl(options.repoUrl);
  if (!/^https?:\/\//.test(repoUrl)) {
    throw new InputError(
      `Not an http(s) git repository URL: ${repoUrl} (expected http(s)://<host>/<path-to-repo>)`,
    );
  }

  return withClone({ gitClient, repoUrl, ref, signal }, async (dir, cloned) => {
    if (cloned.commit !== commit) {
      throw movedOn(cloned, repoUrl, commit);
    }

    const root = await realpath(dir);
    const target = path.join(root, ...filePath.split('/'));
    const notFound = new GitFetchError(
      404,
      `${filePath} was not found in ${repoUrl} at ${shortSha(commit)}.`,
    );
    const stat = await lstat(target).catch(() => undefined);
    if (!stat?.isFile()) {
      throw notFound;
    }
    // A directory on the way may still be a symlink pointing elsewhere.
    const resolved = await realpath(target);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw notFound;
    }
    return await readFile(resolved, 'utf8');
  });
}
