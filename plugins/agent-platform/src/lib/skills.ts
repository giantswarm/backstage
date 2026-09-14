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

/** `owner/repo` for display, derived from the canonical repo URL. */
export function repoSlug(repoUrl: string): string {
  return repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
}

/** The abbreviated commit id, as git prints it. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}
