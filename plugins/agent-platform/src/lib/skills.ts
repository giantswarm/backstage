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
  /**
   * How many files the skill directory holds, SKILL.md included (a nested
   * skill's files count for that one) — the detail page's "· N more files"
   * caption is `fileCount - 1`. The list itself comes with the skill's
   * content (`GET /agent-skills/content`). Absent from older backends.
   */
  fileCount?: number;
}

/**
 * One file of a skill at its commit. Mirrors `SkillFile` in
 * plugins/gs-backend/src/agentSkills/skillFiles.ts.
 */
export interface SkillFile {
  /** Relative to the skill directory (`SKILL.md`, `references/x.md`). */
  path: string;
  /** Size in bytes. */
  size: number;
  /** The git blob id. */
  sha: string;
}

/**
 * The file list `GET /agent-skills/content` answers next to the SKILL.md:
 * SKILL.md first, the rest by path, at most 200. Both fields are absent when
 * the backend could not list the files (or predates file lists).
 */
export interface SkillFileListing {
  files?: SkillFile[];
  /** True when the skill has more files than were listed. */
  filesTruncated?: boolean;
}

/**
 * One file of a skill, as `GET /agent-skills/content/file` answers it.
 * Mirrors `SkillFileContent` in
 * plugins/gs-backend/src/agentSkills/skillFiles.ts.
 */
export interface SkillFileContent extends SkillFile {
  /** Binary (by extension or content): no `content`, link to the source. */
  binary: boolean;
  /** Over the 512 KB inline cap: no `content`, link to the source. */
  truncated: boolean;
  /** The file as UTF-8 text, for a text file within the cap. */
  content?: string;
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

/** Whether two commit ids name the same commit, either possibly abbreviated. */
export function sameCommit(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x));
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

/**
 * Whether the portal can propose a skill change to the repository as a pull
 * request — the add-skill and edit flows. Exactly the check
 * `POST /agent-skills/pull-request` makes (gs-backend), which refuses any
 * other URL with a 400: pull requests are opened through GitHub's API, so a
 * generic-git repository can be read (discovery, SKILL.md content) but not
 * written to from here.
 */
export function canProposeSkillTo(repoUrl: string): boolean {
  return repoUrl.startsWith('https://github.com/');
}

/** A skill's directory with no leading/trailing slashes ('' at repo root). */
function cleanSkillPath(path: string): string {
  return path.replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

/**
 * The first segment of a detail address for a skill outside github.com, and
 * the separator between its repository path and skill directory. A GitHub
 * account name cannot be `-` (nor start with one), so the address can never
 * shadow a github.com skill's; a git host's repository path does not contain
 * a bare `-` segment either (GitLab uses the same separator for the same
 * reason).
 */
const GIT_ADDRESS_MARK = '-';

/**
 * The skill detail page's path under the skills route, each segment
 * URL-encoded:
 *
 * - github.com: `<owner>/<repo>[/<skill dir>]`
 * - any other http(s) git repository: `-/<host>/<repo path>[/-/<skill dir>]`,
 *   e.g. `-/gitea.lab.local/lab/skills/-/ticket-triage`
 *
 * Undefined for a repository URL that is neither.
 */
export function skillDetailPath(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path'>,
): string | undefined {
  const dir = cleanSkillPath(skill.path).split('/').filter(Boolean);
  const parts = githubRepoParts(skill.repoUrl);
  if (parts) {
    return [parts.owner, parts.repo, ...dir].map(encodeURIComponent).join('/');
  }
  const generic = normalizedRepoUrl(skill.repoUrl).match(
    /^https:\/\/([^/]+)\/(.+)$/,
  );
  if (!generic || generic[1] === 'github.com') {
    return undefined;
  }
  const repoPath = generic[2].split('/').filter(Boolean);
  if (repoPath.length === 0 || repoPath.includes(GIT_ADDRESS_MARK)) {
    return undefined;
  }
  return [
    GIT_ADDRESS_MARK,
    generic[1],
    ...repoPath,
    ...(dir.length > 0 ? [GIT_ADDRESS_MARK, ...dir] : []),
  ]
    .map(encodeURIComponent)
    .join('/');
}

/**
 * The inverse of {@link skillDetailPath}: a detail route's splat back into the
 * repository and skill directory it names. Undefined when the splat does not
 * carry at least `owner/repo` (or `-/<host>/<repo>`). A non-GitHub address
 * comes back as `https://<host>/<repo path>`, which compares equal to the
 * configured URL under {@link canonicalSkillId} whatever its scheme was.
 */
export function parseSkillDetailPath(
  splat: string,
): { repoUrl: string; path: string } | undefined {
  const segments = splat.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments[0] === GIT_ADDRESS_MARK) {
    const [, host, ...rest] = segments;
    const mark = rest.indexOf(GIT_ADDRESS_MARK);
    const repoPath = mark === -1 ? rest : rest.slice(0, mark);
    const dir = mark === -1 ? [] : rest.slice(mark + 1);
    if (!host || repoPath.length === 0) {
      return undefined;
    }
    return {
      repoUrl: `https://${host}/${repoPath.join('/')}`,
      path: dir.join('/'),
    };
  }
  if (segments.length < 2) {
    return undefined;
  }
  const [owner, repo, ...rest] = segments;
  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    path: rest.join('/'),
  };
}

/** The skill detail page's tabs below the Overview, by path segment. */
export const SKILL_DETAIL_TABS = ['instructions', 'used-by'] as const;
export type SkillDetailTab = 'overview' | (typeof SKILL_DETAIL_TABS)[number];

function findSkill<T extends Pick<DiscoveredSkill, 'repoUrl' | 'path'>>(
  skills: T[],
  target: { repoUrl: string; path: string },
): T | undefined {
  const wanted = canonicalSkillId(target);
  return skills.find(candidate => canonicalSkillId(candidate) === wanted);
}

/**
 * A detail route's splat, resolved against the catalog: the skill it names
 * and which tab. A tab is a trailing segment (`…/instructions`,
 * `…/used-by`), and a skill directory may be nested, so the whole splat is
 * tried as a skill first and only then with its last segment read as a tab —
 * a skill whose directory is literally named like a tab keeps its own page,
 * at the price of its parent's tab of that name (an accepted corner).
 *
 * `target` is what the splat names when no skill matched (the not-found
 * page); undefined when the splat does not even carry a repository.
 */
export function resolveSkillDetailPath<
  T extends Pick<DiscoveredSkill, 'repoUrl' | 'path'>,
>(
  splat: string,
  skills: T[],
):
  | {
      target: { repoUrl: string; path: string };
      skill: T | undefined;
      tab: SkillDetailTab;
    }
  | undefined {
  const target = parseSkillDetailPath(splat);
  if (!target) {
    return undefined;
  }
  const skill = findSkill(skills, target);
  if (skill) {
    return { target, skill, tab: 'overview' };
  }
  const segments = splat.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const tab = SKILL_DETAIL_TABS.find(candidate => candidate === last);
  if (tab) {
    const parent = parseSkillDetailPath(segments.slice(0, -1).join('/'));
    const parentSkill = parent ? findSkill(skills, parent) : undefined;
    if (parent && parentSkill) {
      return { target: parent, skill: parentSkill, tab };
    }
  }
  return { target, skill: undefined, tab: 'overview' };
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

/**
 * One file of the skill on github.com at the pinned commit (`blob/…`), where
 * the Instructions tab's viewer sends a file it does not show inline (binary,
 * or over the 512 KB cap). `file` is relative to the skill directory.
 * Undefined outside github.com.
 */
export function skillFileUrl(
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path' | 'commit'>,
  file: string,
): string | undefined {
  const parts = githubRepoParts(skill.repoUrl);
  if (!parts) {
    return undefined;
  }
  const segments = [
    ...cleanSkillPath(skill.path).split('/'),
    ...file.split('/'),
  ].filter(Boolean);
  return `https://github.com/${parts.owner}/${parts.repo}/blob/${
    skill.commit
  }/${segments.map(encodeURIComponent).join('/')}`;
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
