import { InputError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { parseFrontmatter } from './frontmatter';

/**
 * A skill discovered in a GitHub repository. Each `SKILL.md` file defines one
 * skill; its containing directory is the skill root, referenced by kagent as a
 * `spec.skills.gitRefs` entry (`{ url, path, ref }`).
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
}

const REPO_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

const SKILL_FILE = 'SKILL.md';

interface TreeEntry {
  path: string;
  type: string;
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
    throw new Error(
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
 * file (at any depth) and reading its frontmatter. Authentication is added when
 * a GitHub integration provides credentials for the repo; public repos work
 * unauthenticated (subject to GitHub's lower anonymous rate limit).
 */
export async function discoverAgentSkills(options: {
  repoUrl: string;
  githubCredentialsProvider: GithubCredentialsProvider;
  /** Git ref to read; defaults to the repo's default branch. */
  ref?: string;
}): Promise<DiscoveredSkill[]> {
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

  const treeResponse = await githubApiFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      branch,
    )}?recursive=1`,
    token,
  );
  const tree = (await treeResponse.json()) as {
    tree?: TreeEntry[];
    truncated?: boolean;
  };

  const skillFiles = (tree.tree ?? []).filter(
    entry => entry.type === 'blob' && isSkillFile(entry.path),
  );

  const skills = await Promise.all(
    skillFiles.map(async (file): Promise<DiscoveredSkill> => {
      const dir = skillDir(file.path);
      const content = await fetchRawContent(
        owner,
        repo,
        file.path,
        branch,
        token,
      );
      const { name, description } = parseFrontmatter(content);
      return {
        name: name?.trim() || dir.split('/').pop() || repo,
        description: description?.trim() ?? '',
        repoUrl: canonicalRepoUrl,
        path: dir,
        ref: branch,
      };
    }),
  );

  // Stable order for the picker; also groups nested skills by directory.
  return skills.sort(
    (a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
  );
}
