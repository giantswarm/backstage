// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';
import {
  baseDataSet,
  inInstallation,
  type FixtureDataSet,
  type FixtureSkill,
  type FixtureSkillRepository,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  SKILL_MANAGER_SERVER,
  type SkillManagerFile,
  type SkillManagerListing,
  type SkillManagerRepository,
  type SkillManagerSkill,
  type SkillManagerTool,
} from '../../../lib/skillManager';
import { canonicalRepoUrl, type SkillFile } from '../../../lib/skills';
import { FIXTURE_USER } from '../fixtureIdentity';
import { asJson, text } from './jsonTools';

/**
 * skill-manager's tools in fixture mode: the skill repositories of the data
 * set, read-only as skill-manager is (a new or changed skill is a pull
 * request, which the portal opens through gs-backend).
 */

const TOOLS = {
  listSkills: 'list_skills',
  getSkill: 'get_skill',
  getSkillFile: 'get_skill_file',
} as const satisfies Record<string, SkillManagerTool>;

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

/** A git blob id of the same length, the same for the same text. */
function blobId(value: string): string {
  let hash = 0x811c9dc5;
  let id = '';
  for (let round = 0; id.length < 40; round++) {
    for (const char of `${round}:${value}`) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    id += hash.toString(16).padStart(8, '0');
  }
  return id.slice(0, 40);
}

/** A skill's files, by path: its SKILL.md and what it refers to. */
function filesOf(skill: FixtureSkill): Map<string, string> {
  const instructions = instructionsOf(skill);
  return new Map([
    [
      'SKILL.md',
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${instructions}`,
    ],
    [
      'references/checklist.md',
      `# Checklist\n\n- Read the change.\n- Run the checks of ${skill.name}.\n- Write down what you found.\n`,
    ],
    [
      'scripts/check.sh',
      `#!/bin/sh\n# The checks ${skill.name} runs.\nset -eu\necho "checking"\n`,
    ],
  ]);
}

function instructionsOf(skill: FixtureSkill): string {
  return [
    `# ${skill.name}`,
    '',
    skill.description,
    '',
    '## Steps',
    '',
    '1. Read the request and what it refers to.',
    '2. Follow `references/checklist.md`.',
    '3. Run `scripts/check.sh` and report what it found.',
    '',
  ].join('\n');
}

function fileOf(path: string, content: string): SkillFile {
  return {
    path,
    size: new TextEncoder().encode(content).length,
    sha: blobId(content),
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
    [TOOLS.listSkills]: (_, { installation }): SkillManagerListing => ({
      repositories: inInstallation(data().skillRepositories, installation).map(
        listedOf,
      ),
    }),
    [TOOLS.getSkill]: (args, { installation }): SkillManagerSkill => {
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
    [TOOLS.getSkillFile]: (args, { installation }): SkillManagerFile => {
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
