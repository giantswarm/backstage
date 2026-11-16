import { FIXTURE_INSTALLATION } from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  inInstallation,
  type FixtureDataSet,
  type FixtureSkillRepository,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  canonicalRepoUrl,
  canProposeSkillTo,
  type SkillFileContent,
} from '../../lib/skills';
import type {
  SkillAt,
  SkillContent,
  SkillDiscoveryApi,
  SkillRepositoryDiscovery,
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

/** How GitHub's API refuses a read, in gs-backend's words. */
function gitHubRefusal(repository: FixtureSkillRepository): Error | undefined {
  const api = `https://api.github.com/repos/${new URL(
    repository.url,
  ).pathname.replace(/^\//, '')}`;
  switch (repository.state) {
    case 'failed':
      return new Error(`GitHub API ${api} returned 503: Service Unavailable`);
    case 'hidden':
      // GitHub answers a private repository the token cannot read as missing.
      return new Error(`GitHub API ${api} returned 404: Not Found`);
    default:
      return undefined;
  }
}

/** A copy, as an HTTP answer is: no caller shares the data set's objects. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * gs-backend's reads of the configured skill repositories in fixture mode
 * (`agentPlatform.fixtures: true`), from the data set rather than GitHub: the
 * portal's own skill source, which Customize · Skills reads where the home
 * installation has no skill-manager. A failed repository fails as GitHub's
 * API does, a stale one answers its last listing (gs-backend's cache), and a
 * repository the data set lacks fails loudly.
 */
export class SkillDiscoveryFixtureApi implements SkillDiscoveryApi {
  constructor(private readonly data: () => FixtureDataSet = baseDataSet) {}

  private repositoryOf(repoUrl: string): FixtureSkillRepository {
    const repository = portalSkillRepositories(this.data()).find(
      r => canonicalRepoUrl(r.url) === canonicalRepoUrl(repoUrl),
    );
    if (!repository) {
      throw notInFixtures(`the skill repository ${repoUrl}`);
    }
    const refusal = gitHubRefusal(repository);
    if (refusal) {
      throw refusal;
    }
    return repository;
  }

  private skillOf({ repoUrl, path }: SkillAt) {
    const repository = this.repositoryOf(repoUrl);
    const skill = repository.skills.find(s => s.path === path);
    if (!skill) {
      throw new Error(`No skill at ${path} in ${repoUrl}.`);
    }
    return { repository, skill };
  }

  async discover(repoUrl: string): Promise<SkillRepositoryDiscovery> {
    const repository = this.repositoryOf(repoUrl);
    const readOnly = repository.state === 'readOnly';
    const at = {
      repoUrl: repository.url,
      ref: repository.ref,
      refKind: 'branch' as const,
      commit: repository.commit,
    };
    return copy({
      skills: repository.skills.map(skill => {
        const files = filesOf(skill);
        return {
          name: skill.name,
          description: skill.description,
          tags: skill.tags,
          ...at,
          path: skill.path,
          contentReadable: true,
          fileCount: files.size,
          ...(readOnly && { readOnly: true }),
        };
      }),
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
      proposable: !readOnly && canProposeSkillTo(repository.url),
      path: readOnly ? 'skills' : '',
      readOnly,
      ref: repository.ref,
      ...(canProposeSkillTo(repository.url) && {
        private: repository.state === 'private',
      }),
    });
  }

  async readSkill(at: SkillAt): Promise<SkillContent> {
    const { repository, skill } = this.skillOf(at);
    return copy({
      repoUrl: repository.url,
      path: skill.path,
      commit: repository.commit,
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
    const { repository, skill } = this.skillOf(at);
    const content = filesOf(skill).get(file);
    if (content === undefined) {
      throw new Error(`No file ${file} in ${repository.url}/${skill.path}.`);
    }
    return {
      ...fileOf(file, content),
      binary: false,
      truncated: false,
      content,
    };
  }
}
