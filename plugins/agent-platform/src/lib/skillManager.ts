import {
  canonicalRepoUrl,
  canProposeSkillTo,
  type DiscoveredSkill,
  type SkillFile,
  type SkillFileContent,
} from './skills';
import type { DiscoveredPlugin, PluginFormat } from './plugins';

/**
 * skill-manager's name in muster: its tools are `x_skill-manager_<tool>`.
 * It owns an installation's skill sources; the portal lists and reads skills
 * through it as the signed-in person.
 */
export const SKILL_MANAGER_SERVER = 'skill-manager';

export type SkillManagerTool =
  'list_skills' | 'list_skill_sources' | 'get_skill' | 'get_skill_file';

export function skillManagerToolName(tool: SkillManagerTool): string {
  return `x_${SKILL_MANAGER_SERVER}_${tool}`;
}

/** One repository of `list_skills`. */
export interface SkillManagerRepository {
  repoUrl: string;
  ref?: string;
  path?: string;
  readOnly?: boolean;
  commit?: string;
  private?: boolean;
  truncated: boolean;
  /**
   * Why the repository could not be read, or why the person may not see it
   * (a private repository: its skills and plugins are then empty).
   */
  error?: string;
  /** The last good listing, kept while reads fail. */
  stale?: boolean;
  skills: {
    name: string;
    description: string;
    path: string;
    tags?: string[];
  }[];
  /** Absent from skill-manager releases before plugin listing. */
  plugins?: {
    name: string;
    path: string;
    format: PluginFormat;
    skills: { name: string; description?: string }[];
  }[];
}

export interface SkillManagerListing {
  repositories: SkillManagerRepository[];
}

/** `get_skill`'s answer; the shape `GET /agent-skills/content` answers. */
export interface SkillManagerSkill {
  repoUrl: string;
  path: string;
  commit: string;
  name: string;
  description: string;
  tags?: string[];
  instructions: string;
  files: SkillFile[];
  filesTruncated?: boolean;
}

/** `get_skill_file`'s answer. */
export type SkillManagerFile = SkillFileContent;

/** The catalog as the portal's pages read it. */
export interface SkillManagerCatalog {
  skills: DiscoveredSkill[];
  plugins: DiscoveredPlugin[];
  hasRepositories: boolean;
  failedRepositories: string[];
  failureMessages: Record<string, string>;
  truncated: boolean;
  /** By canonical URL (`canonicalRepoUrl`), as skill-manager reports them. */
  privateRepositories: ReadonlySet<string>;
  /**
   * The writable sources the person can read that scan the whole
   * repository: a new skill is written to `<name>/SKILL.md` at its root.
   */
  proposalTargets: string[];
}

/**
 * A `list_skills` answer as the catalog: every skill and plugin under the
 * repository and commit it was read at. A repository with an error is
 * failed, with its message, whether or not a stale listing is kept.
 */
export function catalogFromSkillManager(
  listing: SkillManagerListing,
): SkillManagerCatalog {
  const privateRepositories = new Set<string>();
  const catalog: SkillManagerCatalog = {
    skills: [],
    plugins: [],
    hasRepositories: listing.repositories.length > 0,
    failedRepositories: [],
    failureMessages: {},
    truncated: false,
    privateRepositories,
    proposalTargets: [],
  };
  for (const repo of listing.repositories) {
    if (repo.private) {
      privateRepositories.add(canonicalRepoUrl(repo.repoUrl));
    }
    const at = {
      repoUrl: repo.repoUrl,
      ref: repo.ref ?? '',
      commit: repo.commit ?? '',
    };
    if (repo.error) {
      catalog.failedRepositories.push(repo.repoUrl);
      catalog.failureMessages[repo.repoUrl] = repo.error;
    } else if (
      !repo.readOnly &&
      !repo.path &&
      canProposeSkillTo(repo.repoUrl)
    ) {
      catalog.proposalTargets.push(repo.repoUrl);
    }
    catalog.truncated = catalog.truncated || repo.truncated;
    for (const skill of repo.skills) {
      catalog.skills.push({
        name: skill.name,
        description: skill.description,
        ...(skill.tags ? { tags: skill.tags } : {}),
        repoUrl: at.repoUrl,
        path: skill.path,
        ref: at.ref,
        commit: at.commit,
        // No edit pull requests into a read-only source.
        ...(repo.readOnly ? { readOnly: true } : {}),
      });
    }
    for (const plugin of repo.plugins ?? []) {
      catalog.plugins.push({
        name: plugin.name,
        ...at,
        path: plugin.path,
        format: plugin.format,
        skills: plugin.skills.map(skill => ({
          name: skill.name,
          description: skill.description ?? '',
        })),
      });
    }
  }
  return catalog;
}

/** Why no skills are read where muster's server list could not be. */
export function unreachableError(installation: string): Error {
  return new Error(
    `Could not ask muster on ${installation} whether it runs skill-manager; reload to try again.`,
  );
}
