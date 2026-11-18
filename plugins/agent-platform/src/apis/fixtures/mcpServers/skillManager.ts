// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';
import {
  baseDataSet,
  inInstallation,
  type FixtureDataSet,
  type FixtureSkillRepository,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  SKILL_MANAGER_SERVER,
  SKILL_MANAGER_TOOLS,
  type SkillManagerFile,
  type SkillManagerListing,
  type SkillManagerRepository,
  type SkillManagerSkill,
} from '../../../lib/skillManager';
import { canonicalRepoUrl } from '../../../lib/skills';
import { FIXTURE_USER } from '../fixtureIdentity';
import { fileOf, filesOf, instructionsOf } from '../skillFixtureFiles';
import { asJson, text } from './jsonTools';

/**
 * skill-manager's tools in fixture mode: the skill repositories of the data
 * set, read-only as skill-manager is (a new or changed skill is a pull
 * request, which the portal opens through gs-backend).
 */

/** Why a repository the person may not read lists nothing. */
const HIDDEN = `private repository: ${FIXTURE_USER.email} cannot read it`;

function errorOf(repository: FixtureSkillRepository): string | undefined {
  switch (repository.state) {
    case 'failed':
    case 'stale':
      return `cloning ${repository.url}: the remote answered 503 Service Unavailable`;
    case 'hidden':
      return HIDDEN;
    default:
      return undefined;
  }
}

function listedOf(repository: FixtureSkillRepository): SkillManagerRepository {
  const error = errorOf(repository);
  return {
    repoUrl: repository.url,
    ref: repository.ref,
    ...(repository.state === 'readOnly' && { path: 'skills', readOnly: true }),
    commit: repository.commit,
    ...((repository.state === 'private' || repository.state === 'hidden') && {
      private: true,
    }),
    truncated: false,
    ...(error && { error }),
    ...(repository.state === 'stale' && { stale: true }),
    skills: repository.skills.map(({ name, description, path, tags }) => ({
      name,
      description,
      path,
      tags,
    })),
    plugins: repository.plugins.map(plugin => ({
      name: plugin.name,
      path: plugin.path,
      format: plugin.format,
      skills: plugin.skills.map(name => ({
        name,
        description:
          repository.skills.find(skill => skill.name === name)?.description ??
          '',
      })),
    })),
  };
}

/** skill-manager's tools in fixture mode, on the data set given. */
export function skillManagerFixtureServer(
  data: () => FixtureDataSet = baseDataSet,
): FixtureMcpServer {
  const repositoryOf = (installation: string, url: string) => {
    const repository = inInstallation(data().skillRepositories, installation)
      .filter(r => r.state !== 'hidden')
      .find(r => canonicalRepoUrl(r.url) === canonicalRepoUrl(url));
    if (!repository) {
      throw new Error(
        `repository ${url} is not a skill source of this installation`,
      );
    }
    return repository;
  };
  const skillOf = (installation: string, args: Record<string, unknown>) => {
    const repository = repositoryOf(installation, text(args, 'url'));
    const path = text(args, 'path');
    const skill = repository.skills.find(s => s.path === path);
    if (!skill) {
      throw new Error(`no skill at ${path} in ${repository.url}`);
    }
    return { repository, skill };
  };
  const tools: FixtureMcpServer['tools'] = {
    [SKILL_MANAGER_TOOLS.listSkills]: (
      _,
      { installation },
    ): SkillManagerListing => ({
      repositories: inInstallation(data().skillRepositories, installation).map(
        listedOf,
      ),
    }),
    [SKILL_MANAGER_TOOLS.getSkill]: (
      args,
      { installation },
    ): SkillManagerSkill => {
      const { repository, skill } = skillOf(installation, args);
      return {
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
      };
    },
    [SKILL_MANAGER_TOOLS.getSkillFile]: (
      args,
      { installation },
    ): SkillManagerFile => {
      const { repository, skill } = skillOf(installation, args);
      const path = text(args, 'file');
      const content = filesOf(skill).get(path);
      if (content === undefined) {
        throw new Error(`no file ${path} in ${repository.url}/${skill.path}`);
      }
      return {
        ...fileOf(path, content),
        binary: false,
        truncated: false,
        content,
      };
    },
  };
  return { server: SKILL_MANAGER_SERVER, tools: asJson(tools) };
}

/** skill-manager's tools in fixture mode. */
export const skillManager: FixtureMcpServer = skillManagerFixtureServer();
