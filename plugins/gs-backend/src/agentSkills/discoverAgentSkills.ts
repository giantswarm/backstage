import { LoggerService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { parseFrontmatter } from './frontmatter';
import {
  assignSkillFiles,
  COMMIT_ID_RE,
  isBelowPath,
  parseConfiguredRef,
  SkillFile,
  SkillFileList,
} from './skillFiles';
import { DiscoveredPlugin, pluginsOf } from './discoverPlugins';

/**
 * A skill discovered in a GitHub repository. Each `SKILL.md` file defines one
 * skill; its containing directory is the skill root. An agent mounts it as a
 * chart `skills[]` entry pinned to a commit (`{ name, path, git: { url,
 * commit } }`), so every skill is read — and reported — at one commit.
 */
export interface DiscoveredSkill {
  /** Frontmatter `name`, falling back to the directory (or repo) basename. */
  name: string;
  /** Frontmatter `description` (empty string when absent). */
  description: string;
  /**
   * Frontmatter `metadata.tags`, a comma-joined string, parsed (see
   * `skillTagsOf`): valid tags only, empty when absent.
   */
  tags: string[];
  /** Canonical repository URL the skill lives in. */
  repoUrl: string;
  /** Subdirectory within the repo that is the skill root; '' at repo root. */
  path: string;
  /** Git ref (branch, tag or commit) the skill was discovered on. */
  ref: string;
  /**
   * What `ref` is. Only a skill read on a branch can take a pull request.
   * Absent from older snapshots: a branch.
   */
  refKind?: RefKind;
  /**
   * The full commit id `ref` pointed at when the tree was read — the pin an
   * agent carries. The tree and every `SKILL.md` are read at this commit, so
   * the skill shown is the skill pinned.
   */
  commit: string;
  /**
   * Whether the portal read this skill's `SKILL.md` at `commit` with its own
   * credentials (the GitHub integration's token, or an anonymous clone). Only
   * a readable skill can be shown or edited from the portal; an unreadable one
   * is still listed (it exists in the tree) with the metadata at hand.
   */
  contentReadable: boolean;
  /**
   * How many files the skill directory holds, `SKILL.md` included (files of
   * a nested skill below it count for that one) — the "· N more files"
   * caption. The list itself is on `GET /agent-skills/content`. Set by both
   * providers; absent only from a snapshot made before files were listed.
   */
  fileCount?: number;
}

/**
 * Result of a discovery run. `commit` is the head of `ref` the whole listing
 * was read at; `truncated` is true when GitHub capped the git tree and some
 * skills may be missing from `skills`.
 */
export interface DiscoverAgentSkillsResult {
  skills: DiscoveredSkill[];
  /** What `ref` is (see `DiscoveredSkill.refKind`). */
  refKind?: RefKind;
  /**
   * The plugins in the same tree (see `pluginsOf`), at the same commit. An
   * Agent Plugins package's skills are in `skills` too: each can also be
   * mounted on its own.
   */
  plugins?: DiscoveredPlugin[];
  ref: string;
  commit: string;
  truncated: boolean;
  /**
   * Whether GitHub reports the repository private: only its collaborators
   * read it, and an agent fetches its skills only with a credential. Absent
   * when the provider cannot tell (a generic git host, read anonymously).
   */
  private?: boolean;
}

/** What a skill source's ref is: only a branch can take a pull request. */
export type RefKind = 'branch' | 'tag' | 'commit';

/**
 * A discovery result plus what it read on the way: the raw `SKILL.md` of each
 * readable skill, by skill path. Kept server-side (the discovery cache answers
 * `GET /agent-skills/content` from it), never sent to the browser.
 */
export interface SkillDiscoverySnapshot extends DiscoverAgentSkillsResult {
  contents: Map<string, string>;
  /**
   * Every skill's files at `commit`, by skill path (see `assignSkillFiles`):
   * what `GET /agent-skills/content` lists and `/content/file` checks a
   * requested file against.
   */
  files?: Map<string, SkillFileList>;
  /**
   * Small files read on the way, by repository-relative path — a checkout
   * scan (the generic-git provider) has them at hand. The discovery cache
   * moves them into its size-capped file cache, so the file viewer needs no
   * clone per file.
   */
  fileContents?: Map<string, Uint8Array>;
}

/**
 * A non-2xx response from the GitHub API, carrying the upstream status so the
 * route can forward it (a 404 repo or 403/429 rate limit is an expected
 * outcome, not an internal error). `rateLimited` marks a refusal by GitHub's
 * primary or secondary rate limit; `retryAt` (epoch ms) is when GitHub said
 * asking again makes sense, when it said so.
 */
export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly rateLimit?: { retryAt?: number },
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }

  get rateLimited(): boolean {
    return this.status === 429 || this.rateLimit !== undefined;
  }
}

/**
 * `https://github.com/<owner>/<repo>`, optionally `.git` and one trailing
 * slash. Owner and repository are GitHub's own name alphabet, so nothing
 * percent-encoded, no `?` or `#`, and (checked in `parseRepoUrl`) no `.` or
 * `..` can turn the API URLs built from them into another endpoint.
 */
const REPO_URL_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

const SKILL_FILE = 'SKILL.md';

// Cap simultaneous GitHub content requests so a skill-heavy repo doesn't trip
// GitHub's secondary (abuse) rate limits or exhaust the anonymous quota.
const CONTENT_FETCH_CONCURRENCY = 5;

/** An entry of a recursive git tree as GitHub answers it. */
export interface TreeEntry {
  path: string;
  type: string;
  mode?: string;
  sha?: string;
  size?: number;
}

/** A git tree entry's mode for a symbolic link. */
const SYMLINK_MODE = '120000';

/** Runs `fn` over `items` with at most `limit` in flight, collecting settled
 * results so one rejection doesn't fail the whole batch. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.allSettled(batch.map(fn))));
  }
  return results;
}

/** Splits a `https://github.com/{owner}/{repo}` URL into its parts. */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(REPO_URL_RE);
  if (!match || /^\.+$/.test(match[1]) || /^\.+$/.test(match[2])) {
    throw new InputError(
      `Not a github.com repository URL: ${repoUrl} (expected https://github.com/<owner>/<repo>)`,
    );
  }
  return { owner: match[1], repo: match[2] };
}

function isSkillFile(path: string): boolean {
  return path === SKILL_FILE || path.endsWith(`/${SKILL_FILE}`);
}

/** The skill root directory for a `SKILL.md` path ('' when at repo root). */
function skillDir(path: string): string {
  return path === SKILL_FILE ? '' : path.slice(0, -(SKILL_FILE.length + 1)); // drop trailing "/SKILL.md"
}

/**
 * The skills of a recursive git tree and each one's files. Only regular files
 * are listed: a symbolic link could point out of its skill (the portal reads
 * with its own token), and a submodule is not a file of this repository.
 * `treeTruncated` (GitHub capped the tree) marks every list truncated: any
 * of them may be missing files.
 */
export function skillFilesFromTree(
  entries: TreeEntry[],
  treeTruncated = false,
): {
  skillDirs: string[];
  files: Map<string, SkillFileList>;
} {
  const blobs = entries.filter(entry => entry.type === 'blob');
  const skillDirs = blobs
    .filter(entry => isSkillFile(entry.path))
    .map(entry => skillDir(entry.path));
  const files = assignSkillFiles(
    skillDirs,
    blobs
      .filter(entry => entry.mode !== SYMLINK_MODE)
      .map((entry): SkillFile => ({
        path: entry.path,
        size: entry.size ?? 0,
        sha: entry.sha ?? '',
      })),
  );
  if (treeTruncated) {
    for (const list of files.values()) {
      list.truncated = true;
    }
  }
  return { skillDirs, files };
}

async function githubApiFetch(
  url: string,
  token: string | undefined,
  accept = 'application/vnd.github+json',
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // `signal` (the read guard's deadline) cancels the request and its body.
  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    const limited = rateLimitMessage(response, Boolean(token));
    throw new GitHubApiError(
      response.status,
      limited?.message ??
        `GitHub API ${url} returned ${response.status}: ${response.statusText}`,
      limited ? { retryAt: limited.retryAt } : undefined,
    );
  }
  return response;
}

/**
 * GitHub refuses with 403 (or 429) both when the primary rate limit is used
 * up (no requests left in the window) and when its secondary limit trips (a
 * `retry-after` header); said in words, since a bare 403 reads as a
 * permission problem.
 */
function rateLimitMessage(
  response: Response,
  authenticated: boolean,
): { message: string; retryAt?: number } | undefined {
  if (response.status !== 403 && response.status !== 429) {
    return undefined;
  }
  const retryAfter = Number(response.headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return {
      message: `GitHub's secondary rate limit refused the read: too many requests in a short time. Try again in ${retryAfter} seconds.`,
      retryAt: Date.now() + retryAfter * 1000,
    };
  }
  if (response.headers?.get('x-ratelimit-remaining') !== '0') {
    return undefined;
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const hasReset = Number.isFinite(reset) && reset > 0;
  const until = hasReset
    ? ` until ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC`
    : '';
  return {
    message: authenticated
      ? `GitHub's API rate limit for the portal's token is used up${until}.`
      : `GitHub's API rate limit for this portal's IP address is used up${until}: the portal reads GitHub without a token, which GitHub allows 60 requests an hour per IP.`,
    retryAt: hasReset ? reset * 1000 : undefined,
  };
}

/** What discovery needs of `GET /repos/{owner}/{repo}`. */
interface RepositoryInfo {
  defaultBranch: string;
  private: boolean;
}

async function readRepository(
  owner: string,
  repo: string,
  token: string | undefined,
  signal?: AbortSignal,
): Promise<RepositoryInfo> {
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    token,
    undefined,
    signal,
  );
  const data = (await response.json()) as {
    default_branch?: string;
    private?: boolean;
  };
  return {
    defaultBranch: data.default_branch || 'main',
    private: data.private === true,
  };
}

/**
 * The full commit id a ref points at right now. `GET /repos/{o}/{r}/commits/{ref}`
 * with the `sha` media type answers a bare SHA for a branch, a tag or a commit
 * alike, so the caller's `ref` needs no classification.
 */
async function resolveHeadCommit(
  owner: string,
  repo: string,
  ref: string,
  token: string | undefined,
  logger?: LoggerService,
  signal?: AbortSignal,
): Promise<string> {
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(
      ref,
    )}`,
    token,
    'application/vnd.github.sha',
    signal,
  );
  const sha = (await response.text()).trim();
  if (!COMMIT_ID_RE.test(sha)) {
    // The body stays out of the answer: it is whatever GitHub served.
    logger?.debug('GitHub did not answer a commit id', {
      repository: `${owner}/${repo}`,
      ref,
      body: sha.slice(0, 200),
    });
    throw new GitHubApiError(
      502,
      `GitHub did not answer a commit id for ${owner}/${repo}@${ref}.`,
    );
  }
  return sha;
}

/** The fully qualified ref a configured `ref` of `kind` is read at. */
function qualifiedRef(ref: string, kind: RefKind): string {
  const { name } = parseConfiguredRef(ref);
  if (kind === 'commit') {
    return name;
  }
  return kind === 'branch' ? `refs/heads/${name}` : `refs/tags/${name}`;
}

/**
 * What a configured `ref` is on GitHub (`git/ref/heads|tags/<name>` answers
 * exactly that ref or 404). A full commit id is a commit; `refs/heads/<name>`
 * and `refs/tags/<name>` must be that branch or tag; a plain name must be
 * exactly one of them. A name that is both is refused, as is anything else
 * (a short commit id): the git provider classifies the same way
 * (`classifyRemoteRef`), so a configuration reads the same commit on both.
 */
export async function githubRefKind(
  owner: string,
  repo: string,
  ref: string,
  token: string | undefined,
  signal?: AbortSignal,
): Promise<RefKind> {
  const { form, name } = parseConfiguredRef(ref);
  if (form === 'commit') {
    return 'commit';
  }
  const exists = async (namespace: 'heads' | 'tags') => {
    try {
      const response = await githubApiFetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/${namespace}/${name
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
        token,
        undefined,
        signal,
      );
      // Only the status matters: release the connection.
      await response.body?.cancel();
      return true;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return false;
      }
      throw error;
    }
  };
  const [branch, tag] = await Promise.all([
    form === 'tag' ? false : exists('heads'),
    form === 'branch' ? false : exists('tags'),
  ]);
  if (branch && tag) {
    throw new GitHubApiError(
      422,
      `${ref} is both a branch and a tag of ${owner}/${repo}: configure refs/heads/${name} or refs/tags/${name}.`,
    );
  }
  if (branch) {
    return 'branch';
  }
  if (tag) {
    return 'tag';
  }
  throw new GitHubApiError(
    404,
    `${ref} is not a branch, tag or full commit id of ${owner}/${repo}.`,
  );
}

/**
 * The whole recursive git tree at a commit, one request. `truncated` is
 * GitHub capping it (~100k entries / 7 MB): then some entries are missing.
 */
export async function readGitHubTree(
  owner: string,
  repo: string,
  commit: string,
  token: string | undefined,
  signal?: AbortSignal,
): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`,
    token,
    undefined,
    signal,
  );
  const tree = (await response.json()) as {
    tree?: TreeEntry[];
    truncated?: boolean;
  };
  return { entries: tree.tree ?? [], truncated: Boolean(tree.truncated) };
}

/**
 * A file's raw bytes at a ref (or commit) through the contents API — for a
 * file that may not be text.
 */
export async function fetchRawBytes(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string | undefined,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(
      ref,
    )}`,
    token,
    'application/vnd.github.raw+json',
    signal,
  );
  return new Uint8Array(await response.arrayBuffer());
}

/** A file's raw content at a ref (or commit) through the contents API. */
export async function fetchRawContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(
      ref,
    )}`,
    token,
    'application/vnd.github.raw+json',
    signal,
  );
  return response.text();
}

/**
 * The GitHub integration's token for a repository, or undefined when no
 * integration provides credentials for it — public repositories are read
 * unauthenticated then (subject to GitHub's lower anonymous rate limit).
 */
export async function integrationToken(
  githubCredentialsProvider: GithubCredentialsProvider,
  canonicalRepoUrl: string,
): Promise<string | undefined> {
  try {
    const { token } = await githubCredentialsProvider.getCredentials({
      url: canonicalRepoUrl,
    });
    return token;
  } catch {
    // No integration/credentials — proceed unauthenticated for public repos.
    return undefined;
  }
}

/**
 * Discovers agent skills in a GitHub repository by finding every `SKILL.md`
 * file (at any depth) and reading its frontmatter. The ref is resolved to its
 * head commit first and the tree and every file are read at that commit, so
 * the listing is one consistent snapshot and each skill carries the commit an
 * agent pins it to. Authentication is added when a GitHub integration provides
 * credentials for the repo; public repos work unauthenticated (subject to
 * GitHub's lower anonymous rate limit).
 *
 * A `SKILL.md` that cannot be read (a refusal, a rate limit mid-run) does not
 * drop its skill: the tree says it exists, so it is listed with
 * `contentReadable: false` and the metadata at hand — the previous snapshot's
 * name and description for the same directory, else the directory name.
 *
 * The same tree read lists every skill's other files (`files`, see
 * `skillFilesFromTree`) at no extra request.
 *
 * `previous` is the last snapshot of the same repository and ref (the
 * discovery cache passes it): when the ref still points at its commit, the
 * tree (with the file lists it gave) and the files already read are not
 * fetched again — a revalidation then
 * costs two requests (default branch, head commit) instead of 3 + one per
 * skill — and only the skills that were unreadable are retried.
 */
export async function discoverAgentSkills(options: {
  repoUrl: string;
  githubCredentialsProvider: GithubCredentialsProvider;
  /** Git ref to read; defaults to the repo's default branch. */
  ref?: string;
  /**
   * Directory to scan, repository-relative ('' or absent: the whole tree).
   * Skills keep their repository-relative paths.
   */
  scanPath?: string;
  /** The last snapshot of this repository and ref, to reuse what it read. */
  previous?: SkillDiscoverySnapshot;
  logger?: LoggerService;
  /** Cancels every request (the read guard's deadline). */
  signal?: AbortSignal;
}): Promise<SkillDiscoverySnapshot> {
  const { repoUrl, githubCredentialsProvider, previous, logger, signal } =
    options;
  // An empty ref is the default branch, as absent is: never `…/commits/`.
  const ref = options.ref || undefined;
  const { owner, repo } = parseRepoUrl(repoUrl);
  const canonicalRepoUrl = `https://github.com/${owner}/${repo}`;

  const token = await integrationToken(
    githubCredentialsProvider,
    canonicalRepoUrl,
  );

  // The repository read answers the default branch and the private flag. A
  // refresh at a named ref keeps the flag its last snapshot read rather than
  // spend a request on what seldom changes.
  const repository =
    ref === undefined || previous?.private === undefined
      ? await readRepository(owner, repo, token, signal)
      : undefined;
  const branch = ref ?? repository!.defaultBranch;
  const isPrivate = repository?.private ?? previous?.private;
  // The default branch is a branch. A configured ref is classified (and read
  // fully qualified, so a branch and a tag of one name cannot be mixed up)
  // again only when the commit it points at moved.
  let refKind: RefKind = 'branch';
  let commit: string;
  if (ref === undefined) {
    commit = await resolveHeadCommit(
      owner,
      repo,
      branch,
      token,
      logger,
      signal,
    );
  } else {
    const known = previous?.ref === ref ? previous.refKind : undefined;
    const atKnown = known
      ? await resolveHeadCommit(
          owner,
          repo,
          qualifiedRef(ref, known),
          token,
          logger,
          signal,
        ).catch(() => undefined)
      : undefined;
    if (known && atKnown !== undefined && atKnown === previous?.commit) {
      refKind = known;
      commit = atKnown;
    } else {
      refKind = await githubRefKind(owner, repo, ref, token, signal);
      commit = await resolveHeadCommit(
        owner,
        repo,
        qualifiedRef(ref, refKind),
        token,
        logger,
        signal,
      );
    }
  }

  const unchanged =
    previous !== undefined &&
    previous.commit === commit &&
    previous.ref === branch &&
    !previous.truncated;

  let skillDirs: string[];
  let files: Map<string, SkillFileList>;
  // The tree's file paths, for the plugins; undefined when the previous
  // snapshot's plugins are reused.
  let treePaths: string[] | undefined;
  let treeTruncated = false;
  if (unchanged && previous.files && previous.plugins) {
    // The same commit: the same tree, so the same skills, files and plugins.
    skillDirs = previous.skills.map(s => s.path);
    files = previous.files;
  } else {
    const tree = await readGitHubTree(owner, repo, commit, token, signal);
    const scanPath = options.scanPath ?? '';
    // Nothing above or beside the scanned directory, plugin manifests
    // included: a plugin rooted above it would pin the whole repository.
    const entries = tree.entries.filter(entry =>
      isBelowPath(entry.path, scanPath),
    );
    if (scanPath && entries.length === 0 && !tree.truncated) {
      // A misspelt `path` is a configuration error, not an empty source.
      throw new GitHubApiError(
        404,
        `${scanPath} does not exist in ${owner}/${repo} at ${branch}.`,
      );
    }
    ({ skillDirs, files } = skillFilesFromTree(entries, tree.truncated));
    treePaths = entries
      .filter(entry => entry.type === 'blob')
      .map(entry => entry.path);
    // GitHub caps the recursive tree (~100k entries / 7MB); past that some
    // SKILL.md files are missing.
    treeTruncated = tree.truncated;
  }

  const previousByDir = new Map(
    (previous?.skills ?? []).map(s => [s.path, s] as const),
  );
  const contents = new Map<string, string>();
  // Already read at this very commit: reuse, don't fetch again.
  const toRead = skillDirs.filter(dir => {
    const known = unchanged ? previousByDir.get(dir) : undefined;
    if (known?.contentReadable) {
      const raw = previous?.contents.get(dir);
      if (raw !== undefined) {
        contents.set(dir, raw);
      }
      return false;
    }
    return true;
  });

  // Fetch each SKILL.md with bounded concurrency; a single failed read (e.g. a
  // transient rate limit) marks that one skill unreadable rather than failing
  // the whole discovery.
  const settled = await mapWithConcurrency(
    toRead,
    CONTENT_FETCH_CONCURRENCY,
    async (dir): Promise<string> =>
      fetchRawContent(
        owner,
        repo,
        dir ? `${dir}/${SKILL_FILE}` : SKILL_FILE,
        commit,
        token,
        signal,
      ),
  );
  const fresh = new Map<string, PromiseSettledResult<string>>(
    toRead.map((dir, i) => [dir, settled[i]]),
  );

  const skills = skillDirs
    .map((dir): DiscoveredSkill => {
      const base = {
        repoUrl: canonicalRepoUrl,
        path: dir,
        ref: branch,
        ...(ref !== undefined ? { refKind } : {}),
        commit,
        fileCount: files.get(dir)?.total ?? 0,
      };
      const fallbackName = dir.split('/').pop() || repo;
      const read = fresh.get(dir);
      const known = previousByDir.get(dir);
      if (read === undefined && known) {
        // Reused from the snapshot at this commit.
        return { ...known, tags: known.tags ?? [], ...base };
      }
      if (read?.status === 'fulfilled') {
        contents.set(dir, read.value);
        const { name, description, tags } = parseFrontmatter(read.value);
        return {
          ...base,
          name: name?.trim() || fallbackName,
          description: description?.trim() ?? '',
          tags,
          contentReadable: true,
        };
      }
      return {
        ...base,
        name: known?.name ?? fallbackName,
        description: known?.description ?? '',
        tags: known?.tags ?? [],
        contentReadable: false,
      };
    })
    // Stable order for the picker; also groups nested skills by directory.
    .sort(
      (a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
    );

  const plugins = treePaths
    ? pluginsOf(treePaths, skills, {
        repoUrl: canonicalRepoUrl,
        ref: branch,
        commit,
        repoName: repo,
      })
    : (previous?.plugins ?? []);

  return {
    skills,
    plugins,
    ref: branch,
    ...(ref !== undefined ? { refKind } : {}),
    commit,
    truncated: treeTruncated,
    private: isPrivate,
    contents,
    files,
  };
}
