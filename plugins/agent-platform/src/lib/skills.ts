// A skill discovered in a configured GitHub repository. Mirrors the backend's
// DiscoveredSkill (gs-backend `/agent-skills`): each `SKILL.md` is one skill,
// referenced by its repo URL + subdirectory path, read at one commit.
export interface DiscoveredSkill {
  /** Display name (frontmatter `name`, else directory basename). */
  name: string;
  /** Frontmatter `description` (may be empty). */
  description: string;
  /** Repository URL the skill lives in. */
  repoUrl: string;
  /** Subdirectory within the repo that is the skill root; '' at repo root. */
  path: string;
  /** Git ref (branch) the skill was discovered on. */
  ref: string;
  /**
   * The head commit of `ref` when the skill was read — the immutable reference
   * the agent is pinned to. Resolved at discovery, so the commit the picker
   * shows is the one that is written.
   */
  commit: string;
  /**
   * Whether the portal read this skill's SKILL.md at `commit` (gs-backend
   * reads it with its own credentials while discovering). False for a skill
   * listed from the repository tree whose file it could not read: the portal
   * can neither show nor edit it. Absent (older backends) reads as readable.
   */
  contentReadable?: boolean;
}

/**
 * Whether the portal can read the skill's SKILL.md — the condition for
 * editing it from the portal (the edit is prefilled from the file).
 */
export function isSkillContentReadable(
  skill: Pick<DiscoveredSkill, 'contentReadable'>,
): boolean {
  return skill.contentReadable !== false;
}

/** Stable identity for a discovered/selected skill (repo + path). */
export function skillId(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path'>,
): string {
  return `${skill.repoUrl}#${skill.path}`;
}

/**
 * A skill repository's URL in one shape, whatever shape an agent or the
 * configuration wrote it in, keeping the case it was written in: `https://`,
 * the host lowercased, no credentials, no `.git` suffix, no trailing slash,
 * and an scp-like `git@host:owner/repo` or a `git+`/`ssh://` prefix read as
 * the same repository.
 */
export function normalizedRepoUrl(repoUrl: string): string {
  let url = repoUrl.trim().replace(/^git\+/, '');
  const scpLike = url.match(/^[\w.-]+@([^:/]+):(.+)$/);
  if (scpLike) {
    url = `https://${scpLike[1]}/${scpLike[2]}`;
  }
  url = url
    .replace(/^(?:ssh|git|http):\/\/(?:[^@/]+@)?/, 'https://')
    .replace(/^https:\/\/[^@/]+@/, 'https://')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const parts = url.match(/^https:\/\/([^/]+)(\/.*)?$/);
  return parts ? `https://${parts[1].toLowerCase()}${parts[2] ?? ''}` : url;
}

/**
 * {@link normalizedRepoUrl} for comparing repositories: github.com paths are
 * lowercased too, since GitHub matches them without regard to case.
 */
export function canonicalRepoUrl(repoUrl: string): string {
  const url = normalizedRepoUrl(repoUrl);
  return url.startsWith('https://github.com/') ? url.toLowerCase() : url;
}

/**
 * {@link skillId} over the canonical repository URL and path, so the same
 * skill written two ways counts once.
 */
export function canonicalSkillId(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path'>,
): string {
  const path = skill.path.replace(/^\.?\/+/, '').replace(/\/+$/, '');
  return skillId({ repoUrl: canonicalRepoUrl(skill.repoUrl), path });
}

/** `owner/repo` for display, derived from the canonical repo URL. */
export function repoSlug(repoUrl: string): string {
  return repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
}

/** The abbreviated commit id, as git prints it. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** `owner` and `repo` of a (normalized) github.com URL, or undefined. */
export function githubRepoParts(
  repoUrl: string,
): { owner: string; repo: string } | undefined {
  const match = normalizedRepoUrl(repoUrl).match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/,
  );
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

/** A skill's directory with no leading/trailing slashes ('' at repo root). */
function cleanSkillPath(path: string): string {
  return path.replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

/**
 * The skill detail page's path under the skills route
 * (`/<owner>/<repo>[/<skill dir>]`), each segment URL-encoded. Undefined for a
 * skill outside github.com, which has no detail page.
 */
export function skillDetailPath(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path'>,
): string | undefined {
  const parts = githubRepoParts(skill.repoUrl);
  if (!parts) {
    return undefined;
  }
  const segments = [
    parts.owner,
    parts.repo,
    ...cleanSkillPath(skill.path).split('/').filter(Boolean),
  ];
  return segments.map(encodeURIComponent).join('/');
}

/**
 * The inverse of {@link skillDetailPath}: a detail route's splat back into the
 * repository and skill directory it names. Undefined when the splat does not
 * carry at least `owner/repo`.
 */
export function parseSkillDetailPath(
  splat: string,
): { repoUrl: string; path: string } | undefined {
  const segments = splat.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2) {
    return undefined;
  }
  const [owner, repo, ...rest] = segments;
  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    path: rest.join('/'),
  };
}

/**
 * The skill's source in the repository at the commit it is pinned to: the
 * SKILL.md's directory (or the repository root). Undefined outside github.com.
 */
export function skillSourceUrl(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path' | 'commit'>,
): string | undefined {
  const parts = githubRepoParts(skill.repoUrl);
  if (!parts) {
    return undefined;
  }
  const dir = cleanSkillPath(skill.path);
  const base = `https://github.com/${parts.owner}/${parts.repo}/tree/${skill.commit}`;
  return dir
    ? `${base}/${dir.split('/').map(encodeURIComponent).join('/')}`
    : base;
}

/** The pinned commit on github.com, for the facts column. */
export function skillCommitUrl(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'commit'>,
): string | undefined {
  const parts = githubRepoParts(skill.repoUrl);
  return parts
    ? `https://github.com/${parts.owner}/${parts.repo}/commit/${skill.commit}`
    : undefined;
}
