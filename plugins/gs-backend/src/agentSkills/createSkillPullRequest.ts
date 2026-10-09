import { dump } from 'js-yaml';
import { GitHubApiError, parseRepoUrl } from './discoverAgentSkills';

/**
 * The header the signed-in person's GitHub access token travels in, from the
 * frontend (which mints it through `githubAuthApiRef`, i.e. the person's own
 * GitHub grant in muster) to the pull-request route. The same literal lives in
 * the frontend's `useProposeSkill` (plugins/agent-platform) — a backend
 * constant cannot be imported there.
 */
export const GITHUB_TOKEN_HEADER = 'gs-github-token';

export interface CreateSkillPullRequestOptions {
  /** The skill repository, `https://github.com/<owner>/<repo>`. */
  repoUrl: string;
  /** The skill's directory name and frontmatter `name` (a DNS-ish slug). */
  skillName: string;
  /** Frontmatter `description`. */
  description: string;
  /** The SKILL.md body under the frontmatter. */
  instructions: string;
  /** The signed-in person's GitHub access token; the PR is authored as them. */
  token: string;
}

export interface SkillPullRequest {
  /** The opened pull request (html_url). */
  pullRequestUrl: string;
  number: number;
  /** The branch the SKILL.md was pushed to (`add-skill/<name>`). */
  branch: string;
  /** The branch the pull request targets (the repo's default branch). */
  base: string;
  /** The path of the new file within the repository. */
  path: string;
}

/** The directory names we accept: lowercase slug, no slashes, no dots. */
export const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

async function githubRequest(
  url: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  const response = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init?.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  return response;
}

async function errorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

async function refuse(step: string, response: Response): Promise<never> {
  const upstream = await errorMessage(response);
  throw new GitHubApiError(
    response.status,
    `GitHub refused to ${step} (${response.status}${
      upstream ? `: ${upstream}` : ''
    }).`,
  );
}

/** The SKILL.md the pull request adds: YAML frontmatter plus the body. */
export function renderSkillMarkdown(options: {
  skillName: string;
  description: string;
  instructions: string;
}): string {
  // js-yaml's dump quotes and escapes whatever the description contains, so
  // the frontmatter stays parseable for any input the route's bounds allow.
  const frontmatter = dump(
    { name: options.skillName, description: options.description },
    { lineWidth: -1 },
  ).trimEnd();
  return `---\n${frontmatter}\n---\n\n${options.instructions.trim()}\n`;
}

/**
 * Opens a pull request that adds `<skillName>/SKILL.md` to a skill repository,
 * authored as the person whose GitHub token is passed: resolve the default
 * branch and its head, create `add-skill/<name>` there, put the file, open the
 * PR. The skill becomes part of the catalog once a teammate merges it and
 * discovery re-reads the head — nothing is applied anywhere by this call.
 *
 * Refusals are thrown as {@link GitHubApiError} with the upstream status, so
 * the route forwards an expected outcome (no push access, the skill already
 * existing, a rate limit) instead of reporting a 500.
 */
export async function createSkillPullRequest(
  options: CreateSkillPullRequestOptions,
): Promise<SkillPullRequest> {
  const { skillName, description, instructions, token } = options;
  const { owner, repo } = parseRepoUrl(options.repoUrl);
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const branch = `add-skill/${skillName}`;
  const path = `${skillName}/SKILL.md`;

  // The repo: its default branch, and whether the person may push at all —
  // said up front in words rather than as a bare 404 from the branch create.
  const repoResponse = await githubRequest(api, token);
  if (!repoResponse.ok) {
    await refuse(`read ${owner}/${repo}`, repoResponse);
  }
  const repoData = (await repoResponse.json()) as {
    default_branch?: string;
    permissions?: { push?: boolean };
  };
  const base = repoData.default_branch || 'main';
  if (repoData.permissions && !repoData.permissions.push) {
    throw new GitHubApiError(
      403,
      `You don't have push access to ${owner}/${repo}, which opening the pull request needs (the branch is created as you).`,
    );
  }

  // A skill of that name on the default branch means the add is a conflict,
  // not a change — say so instead of opening a PR that cannot merge cleanly.
  const existing = await githubRequest(
    `${api}/contents/${encodeURIComponent(skillName)}/SKILL.md?ref=${encodeURIComponent(base)}`,
    token,
  );
  if (existing.ok) {
    throw new GitHubApiError(
      409,
      `A skill named ${skillName} already exists in ${owner}/${repo}.`,
    );
  }
  if (existing.status !== 404) {
    await refuse(`read ${owner}/${repo}'s contents`, existing);
  }

  // The head of the default branch, as a bare SHA whatever kind of ref it is.
  const headResponse = await githubRequest(
    `${api}/commits/${encodeURIComponent(base)}`,
    token,
  );
  if (!headResponse.ok) {
    await refuse(`resolve ${owner}/${repo}@${base}`, headResponse);
  }
  const { sha: baseSha } = (await headResponse.json()) as { sha?: string };
  if (!baseSha) {
    throw new GitHubApiError(
      502,
      `GitHub did not answer a commit id for ${owner}/${repo}@${base}.`,
    );
  }

  const refResponse = await githubRequest(`${api}/git/refs`, token, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });
  if (refResponse.status === 422) {
    throw new GitHubApiError(
      409,
      `The branch ${branch} already exists in ${owner}/${repo} — a pull request for this skill may already be open.`,
    );
  }
  if (!refResponse.ok) {
    await refuse(`create the branch ${branch}`, refResponse);
  }

  const content = Buffer.from(
    renderSkillMarkdown({ skillName, description, instructions }),
    'utf8',
  ).toString('base64');
  const putResponse = await githubRequest(
    `${api}/contents/${encodeURIComponent(skillName)}/SKILL.md`,
    token,
    {
      method: 'PUT',
      body: {
        message: `Add the ${skillName} skill`,
        content,
        branch,
      },
    },
  );
  if (!putResponse.ok) {
    await refuse(`write ${path}`, putResponse);
  }

  const prResponse = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    token,
    {
      method: 'POST',
      body: {
        title: `Add skill: ${skillName}`,
        head: branch,
        base,
        body: `${description.trim()}\n\nOpened from the portal's Customize → Skills tab. The skill appears in the catalog once this merges.`,
      },
    },
  );
  if (!prResponse.ok) {
    await refuse('open the pull request', prResponse);
  }
  const pr = (await prResponse.json()) as {
    html_url?: string;
    number?: number;
  };
  if (!pr.html_url || typeof pr.number !== 'number') {
    throw new GitHubApiError(
      502,
      'GitHub did not answer the opened pull request.',
    );
  }

  return {
    pullRequestUrl: pr.html_url,
    number: pr.number,
    branch,
    base,
    path,
  };
}
