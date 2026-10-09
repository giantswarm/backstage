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
