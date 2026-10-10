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
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { InputError } from '@backstage/errors';
import { parseFrontmatter } from './frontmatter';
import {
  DiscoverAgentSkillsResult,
  DiscoveredSkill,
} from './discoverAgentSkills';

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

/** What a clone resolved to: the branch read and its head commit. */
export interface GitCloneResult {
  /** Full commit id HEAD pointed at — the pin an agent carries. */
  commit: string;
  /** The branch that was read (the remote's default branch when none given). */
  ref: string;
}

/**
 * The network half of discovery, injectable so tests exercise the scan and
 * the error mapping without a git server.
 */
export interface GitClient {
  /**
   * Clones `repoUrl` at `ref` (the default branch when absent), depth 1, into
   * `dir`, leaving a checked-out worktree there.
   */
  clone(dir: string, repoUrl: string, ref?: string): Promise<GitCloneResult>;
}

/** The real client: isomorphic-git over Node's http(s), no git binary. */
const isomorphicGitClient: GitClient = {
  async clone(dir, repoUrl, ref) {
    await git.clone({
      fs,
      http,
      dir,
      url: repoUrl,
      ref,
      singleBranch: true,
      depth: 1,
      noTags: true,
    });
    const commit = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    const branch =
      ref ?? (await git.currentBranch({ fs, dir, fullname: false })) ?? 'HEAD';
    return { commit, ref: branch };
  },
};

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
}

/**
 * Finds every `SKILL.md` under `rootDir` (any depth) and parses its
 * frontmatter. `.git` directories and symlinks are not descended into — the
 * checkout is untrusted content, and a symlink must not walk out of it.
 */
export async function scanSkillsTree(rootDir: string): Promise<ScannedSkill[]> {
  const found: ScannedSkill[] = [];

  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === '.git') {
          continue;
        }
        await walk(path.join(dir, entry.name), entryRel);
      } else if (entry.isFile() && entry.name === SKILL_FILE) {
        const content = await readFile(path.join(dir, entry.name), 'utf8');
        const { name, description } = parseFrontmatter(content);
        found.push({ path: rel, name, description });
      }
    }
  }

  await walk(rootDir, '');
  return found;
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
 */
export async function discoverAgentSkillsFromGit(options: {
  repoUrl: string;
  /** Branch (or tag) to read; defaults to the remote's default branch. */
  ref?: string;
  /** Test seam; the real isomorphic-git client when absent. */
  gitClient?: GitClient;
}): Promise<DiscoverAgentSkillsResult> {
  const { ref, gitClient = isomorphicGitClient } = options;
  const repoUrl = canonicalGitUrl(options.repoUrl);
  if (!/^https?:\/\//.test(repoUrl)) {
    throw new InputError(
      `Not an http(s) git repository URL: ${repoUrl} (expected http(s)://<host>/<path-to-repo>)`,
    );
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-skills-'));
  try {
    let cloned: GitCloneResult;
    try {
      cloned = await gitClient.clone(dir, repoUrl, ref);
    } catch (error) {
      throw toGitFetchError(error, repoUrl, ref);
    }

    const scanned = await scanSkillsTree(dir);
    const skills: DiscoveredSkill[] = scanned
      .map(s => ({
        name:
          s.name?.trim() ||
          s.path.split('/').pop() ||
          repoBasename(repoUrl) ||
          'skill',
        description: s.description?.trim() ?? '',
        repoUrl,
        path: s.path,
        ref: cloned.ref,
        commit: cloned.commit,
      }))
      // Same stable order as the GitHub provider.
      .sort(
        (a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
      );

    return {
      skills,
      ref: cloned.ref,
      commit: cloned.commit,
      // A full checkout was scanned; nothing can be missing.
      truncated: false,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
  /** Test seam; the real isomorphic-git client when absent. */
  gitClient?: GitClient;
}): Promise<string> {
  const { ref, commit, filePath, gitClient = isomorphicGitClient } = options;
  const repoUrl = canonicalGitUrl(options.repoUrl);
  if (!/^https?:\/\//.test(repoUrl)) {
    throw new InputError(
      `Not an http(s) git repository URL: ${repoUrl} (expected http(s)://<host>/<path-to-repo>)`,
    );
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-skills-'));
  try {
    let cloned: GitCloneResult;
    try {
      cloned = await gitClient.clone(dir, repoUrl, ref);
    } catch (error) {
      throw toGitFetchError(error, repoUrl, ref);
    }
    if (cloned.commit !== commit) {
      throw new GitFetchError(
        409,
        `${cloned.ref} of ${repoUrl} has moved on from ${commit.slice(0, 7)} to ${cloned.commit.slice(0, 7)}; reload the skill to read its current version.`,
      );
    }

    const root = await realpath(dir);
    const target = path.join(root, ...filePath.split('/'));
    const notFound = new GitFetchError(
      404,
      `${filePath} was not found in ${repoUrl} at ${commit.slice(0, 7)}.`,
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
