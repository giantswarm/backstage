import {
  FIXTURE_INSTALLATION,
  shortSha,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  inInstallation,
  type FixtureDataSet,
  type FixtureSkillRepository,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  canonicalRepoUrl,
  githubRepoParts,
  type SkillFileContent,
} from '../../lib/skills';
import {
  SKILL_NAME_RE,
  type ProposedSkill,
  type SkillAt,
  type SkillContent,
  type SkillDiscoveryApi,
  type SkillProposalVia,
  type SkillPullRequest,
  type SkillRepositoryDiscovery,
} from '../SkillDiscoveryApi';
import { notInFixtures } from './notInFixtures';
import { fileOf, filesOf, instructionsOf } from './skillFixtureFiles';

/**
 * The repositories `agentPlatform.skills.repositories` names in fixture mode
 * (`app-config.fixtures.yaml`, which a test checks): the skill repositories
 * of the first fixture installation, one in each state.
 */
export function portalSkillRepositories(
  data: FixtureDataSet = baseDataSet(),
): FixtureSkillRepository[] {
  return inInstallation(data.skillRepositories, FIXTURE_INSTALLATION);
}

/**
 * A repository as `agentPlatform.skills.repositories` configures it: the
 * read-only one scans `skills/`, as the data set lays out its skills.
 */
export function portalSkillSourceOf(repository: FixtureSkillRepository): {
  url: string;
  path: string;
  readOnly: boolean;
} {
  const readOnly = repository.state === 'readOnly';
  return { url: repository.url, path: readOnly ? 'skills' : '', readOnly };
}

/** How long ago the stale repository's listing was read. */
const STALE_FOR_MS = 3 * 60 * 60 * 1000;

/** An error the route answers, with its status, in gs-backend's words. */
class RouteError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A copy, as an HTTP answer is: no caller shares the data set's objects. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * gs-backend's skill routes in fixture mode (`agentPlatform.fixtures: true`),
 * from the data set rather than GitHub: the portal's own skill source, which
 * Customize · Skills reads where the home installation has no skill-manager,
 * and the pull request that proposes a skill, to that source or to an
 * installation's skill-manager sources. The portal reads with its own
 * credentials, as gs-backend does, so a private repository lists (marked
 * private) whoever asks. A failed repository fails as GitHub's API does, a
 * stale one answers its last listing marked stale, and a repository the data
 * set lacks fails loudly. A pull request is kept in memory until the page
 * reloads; nothing reaches GitHub.
 */
export class SkillDiscoveryFixtureApi implements SkillDiscoveryApi {
  /** The pull requests opened since the page loaded, by branch per repository. */
  private readonly pullRequests = new Map<string, SkillPullRequest>();
  private nextNumber = 101;

  constructor(
    private readonly data: () => FixtureDataSet = baseDataSet,
    private readonly now: () => number = Date.now,
  ) {}

  private configured(repoUrl: string): FixtureSkillRepository | undefined {
    return portalSkillRepositories(this.data()).find(
      r => canonicalRepoUrl(r.url) === canonicalRepoUrl(repoUrl),
    );
  }

  /** A configured repository, or the route's 400 (and a console error). */
  private repositoryOf(repoUrl: string): FixtureSkillRepository {
    const repository = this.configured(repoUrl);
    if (!repository) {
      throw notInFixtures(`the skill repository ${repoUrl}`);
    }
    return repository;
  }

  /** The skill at `at`, read at the commit asked for, or the route's refusal. */
  private skillAt(at: SkillAt, prefix: string) {
    const repository = this.repositoryOf(at.repoUrl);
    const isGitHub = Boolean(githubRepoParts(repository.url));
    const fail = (status: number, message: string) =>
      new RouteError(status, `${prefix}: ${message}`);
    if (repository.state === 'failed') {
      throw fail(503, this.unavailable(repository));
    }
    // A git repository is cloned at its branch, so the branch must exist and
    // still be at the commit asked for; GitHub reads any commit, and the data
    // set holds only the current one.
    const ref = at.ref || repository.ref;
    if (!isGitHub && ref !== repository.ref) {
      throw fail(
        404,
        `Ref ${ref} was not found in ${repository.url}: Could not find ${ref}.`,
      );
    }
    if (at.commit !== repository.commit) {
      if (!isGitHub) {
        throw fail(
          409,
          `${ref} of ${repository.url} has moved on from ${shortSha(
            at.commit,
          )} to ${shortSha(
            repository.commit,
          )}; reload the skill to read its current version.`,
        );
      }
      throw fail(404, this.noSkillAt(repository.url, at.path, at.commit));
    }
    const skill = repository.skills.find(s => s.path === at.path);
    if (!skill) {
      throw fail(404, this.noSkillAt(repository.url, at.path, at.commit));
    }
    return { repository, skill };
  }

  private noSkillAt(repoUrl: string, path: string, commit: string): string {
    return `${path ? `${path}/SKILL.md` : 'SKILL.md'} was not found in ${repoUrl} at ${shortSha(commit)}.`;
  }

  /** GitHub's answer to a read of a repository it cannot serve. */
  private unavailable(repository: FixtureSkillRepository): string {
    const parts = githubRepoParts(repository.url);
    return parts
      ? `GitHub API https://api.github.com/repos/${parts.owner}/${parts.repo} returned 503: Service Unavailable`
      : `Fetching ${repository.url} failed with HTTP 503 Service Unavailable`;
  }

  async discover(repoUrl: string): Promise<SkillRepositoryDiscovery> {
    const repository = this.repositoryOf(repoUrl);
    if (repository.state === 'failed') {
      throw new RouteError(
        503,
        `Failed to discover skills: ${this.unavailable(repository)}`,
      );
    }
    const { path, readOnly } = portalSkillSourceOf(repository);
    const isGitHub = Boolean(githubRepoParts(repository.url));
    const stale = repository.state === 'stale';
    const at = {
      repoUrl: repository.url,
      ref: repository.ref,
      refKind: 'branch' as const,
      commit: repository.commit,
    };
    return copy({
      skills: repository.skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
        ...at,
        path: skill.path,
        contentReadable: true,
        fileCount: filesOf(skill).size,
        ...(readOnly && { readOnly: true }),
      })),
      plugins: repository.plugins.map(plugin => ({
        name: plugin.name,
        ...at,
        path: plugin.path,
        format: plugin.format,
        skills: plugin.skills.map(name => ({
          name,
          description:
            repository.skills.find(skill => skill.name === name)?.description ??
            '',
        })),
      })),
      truncated: false,
      refKind: 'branch',
      commit: repository.commit,
      proposable: !readOnly && isGitHub,
      path,
      ...(readOnly && { readOnly }),
      ref: repository.ref,
      // GitHub says whether a repository is private; a git server does not.
      ...(isGitHub && {
        private:
          repository.state === 'private' || repository.state === 'hidden',
      }),
      readAt: new Date(this.now() - (stale ? STALE_FOR_MS : 0)).toISOString(),
      stale,
    });
  }

  async readSkill(at: SkillAt): Promise<SkillContent> {
    const { repository, skill } = this.skillAt(at, 'Failed to read the skill');
    return copy({
      repoUrl: repository.url,
      path: skill.path,
      commit: at.commit,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      instructions: instructionsOf(skill),
      files: [...filesOf(skill)].map(([path, content]) =>
        fileOf(path, content),
      ),
      filesTruncated: false,
    });
  }

  async readSkillFile(at: SkillAt, file: string): Promise<SkillFileContent> {
    const { repository, skill } = this.skillAt(
      at,
      'Failed to read the skill file',
    );
    const content = filesOf(skill).get(file);
    if (content === undefined) {
      throw new RouteError(
        404,
        `${file} is not a file of the skill at ${skill.path || 'the root'} of ${repository.url} at ${shortSha(at.commit)}.`,
      );
    }
    return {
      ...fileOf(file, content),
      binary: false,
      truncated: false,
      content,
    };
  }

  async proposeSkill(
    skill: ProposedSkill,
    via?: SkillProposalVia,
  ): Promise<SkillPullRequest> {
    const { repoUrl, skillName } = skill;
    const update = skill.kind === 'update';
    if (update) {
      if (skill.path === undefined) {
        throw new RouteError(
          400,
          'An update needs the path of the skill directory it rewrites',
        );
      }
      if (skill.baseCommit === undefined) {
        throw new RouteError(
          400,
          'An update needs the baseCommit the edit started from, so a change made since is not overwritten',
        );
      }
    } else if (!SKILL_NAME_RE.test(skillName)) {
      throw new RouteError(
        400,
        'skillName must be a lowercase slug (letters, digits and dashes, up to 63 characters)',
      );
    }
    const parts = githubRepoParts(repoUrl);
    if (!parts) {
      throw new RouteError(400, 'Only github.com repository URLs are allowed');
    }
    // The catalog's writable sources only: an installation's skill-manager
    // sources as the person sees them, else the portal's configured list.
    const repository = via
      ? inInstallation(this.data().skillRepositories, via.installation)
          .filter(r => r.state !== 'hidden')
          .find(r => canonicalRepoUrl(r.url) === canonicalRepoUrl(repoUrl))
      : this.configured(repoUrl);
    if (!repository) {
      throw new RouteError(
        400,
        `${repoUrl} is not one of the configured skill repositories`,
      );
    }
    if (repository.state === 'readOnly') {
      throw new RouteError(400, `${repoUrl} is a read-only skill repository`);
    }
    const github = `${parts.owner}/${parts.repo}`;
    const refuse = (status: number, message: string) =>
      new RouteError(status, `Failed to open the pull request: ${message}`);

    let path: string;
    let branch: string;
    if (update) {
      const existing = repository.skills.find(s => s.path === skill.path);
      const file = `${skill.path ? `${skill.path}/` : ''}SKILL.md`;
      if (!existing) {
        throw refuse(
          404,
          `There is no ${file} on ${repository.ref} in ${github} any more — the skill may have been moved or removed since it was read.`,
        );
      }
      if (skill.baseCommit !== repository.commit) {
        throw refuse(
          409,
          `The skill changed since you started editing: ${file} on ${repository.ref} is no longer the version of commit ${shortSha(
            skill.baseCommit!,
          )}. Reload the skill and make the edit on its current version.`,
        );
      }
      path = file;
      branch = `update-skill/${
        (skill.path || parts.repo)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 100)
          .replace(/^-+|-+$/g, '') || 'skill'
      }`;
    } else {
      if (repository.skills.some(s => s.name === skillName)) {
        throw refuse(
          409,
          `A skill named ${skillName} already exists in ${github}.`,
        );
      }
      const parent = via ? '' : portalSkillSourceOf(repository).path;
      path = `${parent ? `${parent}/` : ''}${skillName}/SKILL.md`;
      branch = `add-skill/${skillName}`;
    }

    const key = `${canonicalRepoUrl(repository.url)}#${branch}`;
    const open = this.pullRequests.get(key);
    if (open) {
      throw refuse(
        409,
        `A pull request for this skill is already open from ${branch}: ${open.pullRequestUrl}`,
      );
    }
    const number = this.nextNumber++;
    const pullRequest: SkillPullRequest = {
      pullRequestUrl: `https://github.com/${github}/pull/${number}`,
      number,
      branch,
      base: repository.ref,
      path,
    };
    this.pullRequests.set(key, pullRequest);
    return copy(pullRequest);
  }
}
