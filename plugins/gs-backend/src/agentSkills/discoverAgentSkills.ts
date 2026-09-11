import { InputError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { parseFrontmatter } from './frontmatter';

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
  /** Canonical repository URL the skill lives in. */
  repoUrl: string;
  /** Subdirectory within the repo that is the skill root; '' at repo root. */
  path: string;
  /** Git ref (branch) the skill was discovered on. */
  ref: string;
  /**
   * The full commit id `ref` pointed at when the tree was read — the pin an
   * agent carries. The tree and every `SKILL.md` are read at this commit, so
   * the skill shown is the skill pinned.
   */
  commit: string;
}

/**
 * Result of a discovery run. `commit` is the head of `ref` the whole listing
 * was read at; `truncated` is true when GitHub capped the git tree and some
 * skills may be missing from `skills`.
 */
export interface DiscoverAgentSkillsResult {
  skills: DiscoveredSkill[];
  ref: string;
  commit: string;
  truncated: boolean;
}

/**
 * A non-2xx response from the GitHub API, carrying the upstream status so the
 * route can forward it (a 404 repo or 403/429 rate limit is an expected
 * outcome, not an internal error).
 */
export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

const REPO_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

const SKILL_FILE = 'SKILL.md';

// Cap simultaneous GitHub content requests so a skill-heavy repo doesn't trip
// GitHub's secondary (abuse) rate limits or exhaust the anonymous quota.
const CONTENT_FETCH_CONCURRENCY = 5;

interface TreeEntry {
  path: string;
  type: string;
}

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
  if (!match) {
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

async function githubApiFetch(
  url: string,
  token: string | undefined,
  accept = 'application/vnd.github+json',
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new GitHubApiError(
      response.status,
      `GitHub API ${url} returned ${response.status}: ${response.statusText}`,
    );
  }
  return response;
}

async function resolveDefaultBranch(
  owner: string,
  repo: string,
  token: string | undefined,
): Promise<string> {
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    token,
  );
  const data = (await response.json()) as { default_branch?: string };
  return data.default_branch || 'main';
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
): Promise<string> {
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(
      ref,
    )}`,
    token,
    'application/vnd.github.sha',
  );
  const sha = (await response.text()).trim();
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(sha)) {
    throw new GitHubApiError(
      502,
      `GitHub did not answer a commit id for ${owner}/${repo}@${ref}: ${sha}`,
    );
  }
  return sha;
}

async function fetchRawContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string | undefined,
): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(
      ref,
    )}`,
    token,
    'application/vnd.github.raw+json',
  );
  return response.text();
}

/**
 * Discovers agent skills in a GitHub repository by finding every `SKILL.md`
 * file (at any depth) and reading its frontmatter. The ref is resolved to its
 * head commit first and the tree and every file are read at that commit, so
 * the listing is one consistent snapshot and each skill carries the commit an
 * agent pins it to. Authentication is added when a GitHub integration provides
 * credentials for the repo; public repos work unauthenticated (subject to
 * GitHub's lower anonymous rate limit).
 */
export async function discoverAgentSkills(options: {
  repoUrl: string;
  githubCredentialsProvider: GithubCredentialsProvider;
  /** Git ref to read; defaults to the repo's default branch. */
  ref?: string;
}): Promise<DiscoverAgentSkillsResult> {
  const { repoUrl, githubCredentialsProvider, ref } = options;
  const { owner, repo } = parseRepoUrl(repoUrl);
  const canonicalRepoUrl = `https://github.com/${owner}/${repo}`;

  let token: string | undefined;
  try {
    ({ token } = await githubCredentialsProvider.getCredentials({
      url: canonicalRepoUrl,
    }));
  } catch {
    // No integration/credentials — proceed unauthenticated for public repos.
  }

  const branch = ref ?? (await resolveDefaultBranch(owner, repo, token));
  const commit = await resolveHeadCommit(owner, repo, branch, token);

  const treeResponse = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`,
    token,
  );
  const tree = (await treeResponse.json()) as {
    tree?: TreeEntry[];
    truncated?: boolean;
  };

  const skillFiles = (tree.tree ?? []).filter(
    entry => entry.type === 'blob' && isSkillFile(entry.path),
  );

  // Fetch each SKILL.md with bounded concurrency; a single failed read (e.g. a
  // transient rate limit) drops that one skill rather than failing the whole
  // discovery.
  const settled = await mapWithConcurrency(
    skillFiles,
    CONTENT_FETCH_CONCURRENCY,
    async (file): Promise<DiscoveredSkill> => {
      const dir = skillDir(file.path);
      const content = await fetchRawContent(
        owner,
        repo,
        file.path,
        commit,
        token,
      );
      const { name, description } = parseFrontmatter(content);
      return {
        name: name?.trim() || dir.split('/').pop() || repo,
        description: description?.trim() ?? '',
        repoUrl: canonicalRepoUrl,
        path: dir,
        ref: branch,
        commit,
      };
    },
  );

  const skills = settled
    .filter(
      (r): r is PromiseFulfilledResult<DiscoveredSkill> =>
        r.status === 'fulfilled',
    )
    .map(r => r.value)
    // Stable order for the picker; also groups nested skills by directory.
    .sort(
      (a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
    );

  return {
    skills,
    ref: branch,
    commit,
    // GitHub caps the recursive tree (~100k entries / 7MB); past that some
    // SKILL.md files are missing, or a content read failed above.
    truncated:
      Boolean(tree.truncated) || settled.some(r => r.status === 'rejected'),
  };
}
