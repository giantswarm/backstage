import { GithubCredentialsProvider } from '@backstage/integration';
import { skillFilePath } from './createSkillPullRequest';
import {
  fetchRawContent,
  integrationToken,
  parseRepoUrl,
} from './discoverAgentSkills';
import { GitClient, readFileFromGit } from './discoverAgentSkillsFromGit';
import { splitSkillMarkdown } from './frontmatter';

/**
 * One skill's SKILL.md at a commit, split the way the add-skill form edits it:
 * the frontmatter `name` and `description`, and the Markdown body
 * (`instructions`). What an edit is prefilled with.
 */
export interface SkillContent {
  repoUrl: string;
  /** The skill directory ('' at the repository root). */
  path: string;
  /** The commit the file was read at. */
  commit: string;
  /** Frontmatter `name`, falling back to the directory (or repo) basename. */
  name: string;
  /** Frontmatter `description` ('' when absent). */
  description: string;
  /** The body under the frontmatter. */
  instructions: string;
}

function toSkillContent(
  raw: string,
  location: { repoUrl: string; path: string; commit: string },
  fallbackName: string,
): SkillContent {
  const { frontmatter, body } = splitSkillMarkdown(raw);
  const name =
    typeof frontmatter.name === 'string' && frontmatter.name.trim()
      ? frontmatter.name.trim()
      : location.path.split('/').pop() || fallbackName;
  return {
    ...location,
    name,
    description:
      typeof frontmatter.description === 'string'
        ? frontmatter.description.trim()
        : '',
    instructions: body.trim(),
  };
}

/**
 * The repository's basename (`skills` for `https://host/x/skills.git`), the
 * last name fallback for a root skill without a frontmatter name.
 */
function repoBasename(repoUrl: string): string {
  return (
    repoUrl
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.git$/i, '') || 'skill'
  );
}

/**
 * A skill's content from a `SKILL.md` discovery already read (the discovery
 * cache keeps them): the same split the providers below answer, with no
 * request upstream.
 */
export function skillContentFromRaw(
  raw: string,
  location: { repoUrl: string; path: string; commit: string },
): SkillContent {
  return toSkillContent(raw, location, repoBasename(location.repoUrl));
}

/**
 * A skill's SKILL.md from a github.com repository, at a commit, through the
 * contents API — with the GitHub integration's token when one is configured,
 * like discovery. Refusals throw `GitHubApiError` with the upstream status.
 */
export async function readSkillContentFromGitHub(options: {
  repoUrl: string;
  path: string;
  commit: string;
  githubCredentialsProvider: GithubCredentialsProvider;
}): Promise<SkillContent> {
  const { path, commit, githubCredentialsProvider } = options;
  const { owner, repo } = parseRepoUrl(options.repoUrl);
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const token = await integrationToken(githubCredentialsProvider, repoUrl);
  const raw = await fetchRawContent(
    owner,
    repo,
    skillFilePath(path),
    commit,
    token,
  );
  return toSkillContent(raw, { repoUrl, path, commit }, repo);
}

/**
 * A skill's SKILL.md from any other http(s) git repository, read from the
 * same depth-1 clone discovery makes (no REST API). Refusals throw
 * `GitFetchError` with a forwardable status.
 */
export async function readSkillContentFromGit(options: {
  repoUrl: string;
  path: string;
  commit: string;
  ref?: string;
  gitClient?: GitClient;
}): Promise<SkillContent> {
  const { path, commit, ref, gitClient } = options;
  const repoUrl = options.repoUrl.trim().replace(/\/+$/, '');
  const raw = await readFileFromGit({
    repoUrl,
    ref,
    commit,
    filePath: skillFilePath(path),
    gitClient,
  });
  return toSkillContent(raw, { repoUrl, path, commit }, repoBasename(repoUrl));
}
