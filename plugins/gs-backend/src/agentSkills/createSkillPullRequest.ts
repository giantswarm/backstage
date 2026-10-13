import { LoggerService } from '@backstage/backend-plugin-api';
import { dump } from 'js-yaml';
import { GitHubApiError, parseRepoUrl } from './discoverAgentSkills';
import { splitSkillMarkdown } from './frontmatter';
import { isSkillFilePath } from './skillFiles';

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
  /**
   * The frontmatter `name`. For `create` also the directory, so a lowercase
   * slug ({@link SKILL_NAME_RE}); an `update` may keep the name the skill
   * already has even when it is not one (see {@link existingSkillName}).
   */
  skillName: string;
  /** Frontmatter `description`. */
  description: string;
  /** The SKILL.md body under the frontmatter. */
  instructions: string;
  /** The signed-in person's GitHub access token; the PR is authored as them. */
  token: string;
  /**
   * `create` (the default) adds `<skillName>/SKILL.md`, refusing when it
   * exists; `update` rewrites the existing `<path>/SKILL.md` of a skill the
   * catalog lists, refusing when it is gone.
   */
  kind?: 'create' | 'update';
  /**
   * For `update`: the skill's directory within the repository ('' for a skill
   * at the repository root), as discovery reported it.
   */
  path?: string;
  /**
   * For `update`: the commit the edit started from. The SKILL.md there is the
   * version the edit replaces: when the default branch's file is no longer
   * that blob, the update is refused with 409 instead of overwriting what
   * changed in between. Without it the default branch's head is taken as the
   * start (the route always requires it).
   */
  baseCommit?: string;
  /** For the best-effort cleanup of a branch a failed attempt left (debug). */
  logger?: LoggerService;
}

export interface SkillPullRequest {
  /** The opened pull request (html_url). */
  pullRequestUrl: string;
  number: number;
  /** The branch the SKILL.md was pushed to (`add-skill/<name>`, or
   * `update-skill/<directory as a slug>`; see {@link branchCandidates}). */
  branch: string;
  /** The branch the pull request targets (the repo's default branch). */
  base: string;
  /** The path of the written SKILL.md within the repository. */
  path: string;
}

/** The directory names we accept: lowercase slug, no slashes, no dots. */
export const SKILL_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The longest SKILL.md body (instructions) a pull request writes, in
 * characters. The route's JSON body limit is derived from it.
 */
export const MAX_SKILL_INSTRUCTIONS = 100_000;

/**
 * The longest frontmatter name an update keeps. Create names are slugs of at
 * most 63; an existing skill's display name gets more room, not unlimited.
 */
export const MAX_SKILL_DISPLAY_NAME = 256;

/**
 * The JSON body limit of the pull-request route: the largest instructions
 * plus the description, even if every character were JSON-escaped to six
 * bytes (`\uXXXX`), fit with margin. Express's 100 KB default does not even
 * fit 100,000 ASCII characters plus the rest of the body.
 */
export const SKILL_PULL_REQUEST_BODY_LIMIT = '1mb';

/**
 * Whether `path` is a skill directory as discovery reports one: '' (the
 * repository root) or relative `/`-separated segments by the syntax rule
 * every file path is held to (`isSkillFilePath`) — no leading or trailing
 * slash, no empty, `.` or `..` segment, no backslash or control character,
 * so nothing can address a file outside the repository (or, for a checkout,
 * outside the clone). Discovery filters no directory names, so neither does
 * this: a listed `ops/Incident Review` or `skills/über` must open and edit.
 * Only a new skill's directory is a slug ({@link SKILL_NAME_RE}).
 */
export function isSkillDirectory(path: string): boolean {
  return path === '' || isSkillFilePath(path);
}

/** The SKILL.md of a skill directory ('' → the root `SKILL.md`). */
export function skillFilePath(dir: string): string {
  return dir ? `${dir}/SKILL.md` : 'SKILL.md';
}

/**
 * The name the catalog shows for the skill in `dir`, by discovery's rule: the
 * frontmatter `name` (trimmed), else the directory's last segment, else (a
 * skill at the root) the repository name.
 */
export function existingSkillName(
  frontmatter: Record<string, unknown>,
  dir: string,
  repo: string,
): string {
  const name =
    typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  return name || dir.split('/').pop() || repo;
}

/**
 * The branch an update is pushed to: `update-skill/` plus the skill's
 * directory (the repository name at the root) as a lowercase slug. Derived
 * from the path, not the display name, so a name with spaces or capitals
 * still makes a valid ref, and two skills of one name in different
 * directories do not share a branch.
 */
export function updateBranchName(dir: string, repo: string): string {
  const slug = (dir || repo)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 100)
    .replace(/^-+|-+$/g, '');
  return `update-skill/${slug || 'skill'}`;
}

/**
 * The branch names a pull request tries, in order: the skill's own, then —
 * when that one exists with no open pull request (GitHub keeps a merged
 * pull request's branch by default, and an earlier failed attempt may have
 * left one) — the same suffixed with the default branch head's short sha,
 * then numbered. A leftover branch is never force-updated: it may hold
 * someone's unpublished work.
 */
export function branchCandidates(branch: string, headSha: string): string[] {
  const suffixed = `${branch}-${headSha.slice(0, 7)}`;
  return [branch, suffixed, `${suffixed}-2`, `${suffixed}-3`];
}

/** A repository path for a GitHub contents URL, each segment encoded. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

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

/**
 * The SKILL.md the pull request writes: YAML frontmatter plus the body. An
 * edit passes the existing file's frontmatter as `keepFrontmatter`, so keys
 * the form does not show (`license`, `allowed-tools`, …) survive it; `name`
 * and `description` always come first and from the form.
 */
export function renderSkillMarkdown(options: {
  skillName: string;
  description: string;
  instructions: string;
  keepFrontmatter?: Record<string, unknown>;
}): string {
  const {
    name: _name,
    description: _description,
    ...kept
  } = options.keepFrontmatter ?? {};
  // js-yaml's dump quotes and escapes whatever the description contains, so
  // the frontmatter stays parseable for any input the route's bounds allow.
  const frontmatter = dump(
    { name: options.skillName, description: options.description, ...kept },
    { lineWidth: -1 },
  ).trimEnd();
  return `---\n${frontmatter}\n---\n\n${options.instructions.trim()}\n`;
}

/**
 * Opens a pull request against a skill repository, authored as the person
 * whose GitHub token is passed: resolve the default branch and its head,
 * create a branch there, put the SKILL.md, open the PR. Nothing is applied
 * anywhere by this call — the catalog changes once a teammate merges it and
 * discovery re-reads the head.
 *
 * - `create` (the default) adds `<skillName>/SKILL.md` on `add-skill/<name>`,
 *   refusing with 409 when a skill of that name exists already.
 * - `update` rewrites the existing `<path>/SKILL.md` on
 *   `update-skill/<directory slug>`, replacing the version at `baseCommit`
 *   (the commit the edit started from), whose frontmatter keys the form does
 *   not edit are kept. When the default branch's file is no longer that blob
 *   the update is a 409 — the skill changed since the edit started, and the
 *   person reloads it rather than overwriting the change. The write carries
 *   the blob sha too (GitHub's own guard, for a change racing this call). A
 *   file that is gone is a 404, an edit that changes nothing a 422, a name
 *   that is neither a slug nor the skill's existing name a 422.
 *
 * Either way, when the branch already exists with an open pull request the
 * answer is a 409 naming it; a leftover branch without one is left alone and
 * the next of {@link branchCandidates} is used. When writing the file or
 * opening the pull request fails, the branch this call created is deleted
 * again (best effort). Refusals are thrown as {@link GitHubApiError} with the
 * upstream status, so the route forwards an expected outcome (no push access,
 * the skill already existing, a rate limit) instead of reporting a 500.
 */
export async function createSkillPullRequest(
  options: CreateSkillPullRequestOptions,
): Promise<SkillPullRequest> {
  const { skillName, description, instructions, token, logger } = options;
  const isUpdate = options.kind === 'update';
  const { owner, repo } = parseRepoUrl(options.repoUrl);
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const dir = isUpdate ? (options.path ?? '') : skillName;
  const baseBranch = isUpdate
    ? updateBranchName(dir, repo)
    : `add-skill/${skillName}`;
  const path = skillFilePath(dir);

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

  // The head of the default branch, as a bare SHA whatever kind of ref it is.
  // Resolved first, so the file checked below and the branch created from it
  // are the same commit.
  const headResponse = await githubRequest(
    `${api}/commits/${encodeURIComponent(base)}`,
    token,
  );
  if (!headResponse.ok) {
    await refuse(`resolve ${owner}/${repo}@${base}`, headResponse);
  }
  const { sha: headSha } = (await headResponse.json()) as { sha?: string };
  if (!headSha) {
    throw new GitHubApiError(
      502,
      `GitHub did not answer a commit id for ${owner}/${repo}@${base}.`,
    );
  }

  const readContents = (commit: string) =>
    githubRequest(
      `${api}/contents/${encodePath(path)}?ref=${encodeURIComponent(commit)}`,
      token,
    );
  /** The SKILL.md at a commit: undefined when there is none. */
  const readSkillFile = async (
    commit: string,
  ): Promise<{ sha: string; content?: string } | undefined> => {
    const response = await readContents(commit);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      await refuse(`read ${owner}/${repo}'s contents`, response);
    }
    const file = (await response.json()) as {
      type?: string;
      sha?: string;
      content?: string;
      encoding?: string;
    };
    if (file.type !== 'file' || !file.sha) {
      throw new GitHubApiError(
        502,
        `GitHub did not answer ${path} in ${owner}/${repo} as a file.`,
      );
    }
    return {
      sha: file.sha,
      content:
        typeof file.content === 'string' && file.encoding === 'base64'
          ? Buffer.from(file.content, 'base64').toString('utf8')
          : undefined,
    };
  };

  // An update replaces the version the edit started from: its frontmatter
  // keeps the keys the form does not show, and the default branch's file must
  // still be that blob — otherwise someone changed the skill in between, and
  // writing now would silently drop their change.
  let existingSha: string | undefined;
  let keepFrontmatter: Record<string, unknown> | undefined;
  if (isUpdate) {
    const current = await readSkillFile(headSha);
    if (!current) {
      throw new GitHubApiError(
        404,
        `There is no ${path} on ${base} in ${owner}/${repo} any more — the skill may have been moved or removed since it was read.`,
      );
    }
    const startCommit = options.baseCommit ?? headSha;
    let started = current;
    if (startCommit !== headSha) {
      const atStart = await readSkillFile(startCommit);
      if (!atStart) {
        throw new GitHubApiError(
          404,
          `There is no ${path} at commit ${startCommit.slice(0, 7)} in ${owner}/${repo}, the commit the edit started from.`,
        );
      }
      if (atStart.sha !== current.sha) {
        throw new GitHubApiError(
          409,
          `The skill changed since you started editing: ${path} on ${base} is no longer the version of commit ${startCommit.slice(0, 7)}. Reload the skill and make the edit on its current version.`,
        );
      }
      started = atStart;
    }
    existingSha = current.sha;
    if (started.content !== undefined) {
      keepFrontmatter = splitSkillMarkdown(started.content).frontmatter;
      // A name that is not a slug passes only as the name the skill already
      // has (an edit keeps it); it never names a new or renamed skill.
      if (
        !SKILL_NAME_RE.test(skillName) &&
        skillName !== existingSkillName(keepFrontmatter, dir, repo)
      ) {
        throw new GitHubApiError(
          422,
          `"${skillName}" is not the name of the skill in ${path}: an edit keeps the skill's name, and a new name must be a lowercase slug.`,
        );
      }
      const proposed = renderSkillMarkdown({
        skillName,
        description,
        instructions,
        keepFrontmatter,
      });
      if (proposed === started.content) {
        throw new GitHubApiError(
          422,
          `The edit changes nothing: ${path} on ${base} already reads exactly like this.`,
        );
      }
    } else if (!SKILL_NAME_RE.test(skillName)) {
      throw new GitHubApiError(
        502,
        `GitHub did not answer the content of ${path} in ${owner}/${repo}, which keeping a name that is not a lowercase slug needs.`,
      );
    }
  } else {
    // A skill of that name on the default branch means the add is a
    // conflict, not a change — say so instead of opening a PR that cannot
    // merge cleanly.
    const existing = await readContents(headSha);
    if (existing.ok) {
      throw new GitHubApiError(
        409,
        `A skill named ${skillName} already exists in ${owner}/${repo}.`,
      );
    }
    if (existing.status !== 404) {
      await refuse(`read ${owner}/${repo}'s contents`, existing);
    }
  }

  // The branch, off the head checked above (see branchCandidates).
  let branch: string | undefined;
  for (const candidate of branchCandidates(baseBranch, headSha)) {
    const refResponse = await githubRequest(`${api}/git/refs`, token, {
      method: 'POST',
      body: { ref: `refs/heads/${candidate}`, sha: headSha },
    });
    if (refResponse.ok) {
      branch = candidate;
      break;
    }
    if (refResponse.status !== 422) {
      await refuse(`create the branch ${candidate}`, refResponse);
    }
    // It exists: an open pull request from it is the edit in progress.
    const open = await githubRequest(
      `${api}/pulls?head=${encodeURIComponent(
        `${owner}:${candidate}`,
      )}&state=open&per_page=1`,
      token,
    );
    if (!open.ok) {
      throw new GitHubApiError(
        409,
        `The branch ${candidate} already exists in ${owner}/${repo}, and a pull request for this skill may already be open.`,
      );
    }
    const pulls = (await open.json()) as unknown;
    const pull = Array.isArray(pulls)
      ? (pulls[0] as { html_url?: string } | undefined)
      : undefined;
    if (pull) {
      throw new GitHubApiError(
        409,
        `A pull request for this skill is already open from ${candidate}: ${
          pull.html_url ?? `https://github.com/${owner}/${repo}/pulls`
        }.`,
      );
    }
  }
  if (!branch) {
    throw new GitHubApiError(
      409,
      `The branch ${baseBranch} and its numbered variants already exist in ${owner}/${repo} without an open pull request. Delete the stale branches and try again.`,
    );
  }
  const created = branch;

  /** Best effort: the branch must not block the person's retry. */
  const deleteBranch = async () => {
    try {
      const response = await githubRequest(
        `${api}/git/refs/heads/${encodePath(created)}`,
        token,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        logger?.debug('Could not delete the branch of a failed skill edit', {
          repository: `${owner}/${repo}`,
          branch: created,
          status: response.status,
        });
      }
    } catch (error) {
      logger?.debug('Could not delete the branch of a failed skill edit', {
        repository: `${owner}/${repo}`,
        branch: created,
        error: (error as Error)?.message,
      });
    }
  };

  const content = Buffer.from(
    renderSkillMarkdown({
      skillName,
      description,
      instructions,
      keepFrontmatter,
    }),
    'utf8',
  ).toString('base64');
  const origin = isUpdate
    ? `Edited from the skill's page in the portal${
        options.baseCommit
          ? `, starting from commit ${options.baseCommit.slice(0, 7)}`
          : ''
      }. Agents keep the commit they are pinned to until their skills are updated.`
    : "Opened from the portal's Customize → Skills tab. The skill appears in the catalog once this merges.";
  // One summary for the commit and the pull request: a single-commit pull
  // request squash-merges with the commit's message, so both must agree.
  const summary = isUpdate
    ? `Update skill: ${skillName}`
    : `feat: add skill ${skillName}`;
  let prResponse: Response;
  try {
    const putResponse = await githubRequest(
      `${api}/contents/${encodePath(path)}`,
      token,
      {
        method: 'PUT',
        body: {
          message: summary,
          content,
          branch: created,
          ...(existingSha ? { sha: existingSha } : {}),
        },
      },
    );
    if (!putResponse.ok) {
      await refuse(`write ${path}`, putResponse);
    }

    prResponse = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      token,
      {
        method: 'POST',
        body: {
          title: summary,
          head: created,
          base,
          body: `${description.trim()}\n\n${origin}`,
        },
      },
    );
    if (!prResponse.ok) {
      await refuse('open the pull request', prResponse);
    }
  } catch (error) {
    await deleteBranch();
    throw error;
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
    branch: created,
    base,
    path,
  };
}
