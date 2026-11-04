import { ConfigReader } from '@backstage/config';
import {
  proposableRepositories,
  skillRepositoriesFrom,
} from './skillRepositories';
import { canProposeSkillChange } from './skills';

const configWith = (repositories: unknown) =>
  new ConfigReader({
    agentPlatform: { skills: { repositories } },
  } as never);

describe('skillRepositoriesFrom', () => {
  it('reads plain URLs and objects alike, leaving malformed entries out', () => {
    expect(
      skillRepositoriesFrom(
        configWith([
          'https://github.com/giantswarm/agent-skills',
          {
            url: 'https://github.com/giantswarm/agent-platform',
            ref: 'v1.2.3',
            path: 'skills',
            readOnly: true,
          },
          { ref: 'main' },
          '',
        ]),
      ),
    ).toEqual([
      { url: 'https://github.com/giantswarm/agent-skills', readOnly: false },
      { url: 'https://github.com/giantswarm/agent-platform', readOnly: true },
    ]);
  });

  it('answers nothing without config', () => {
    expect(skillRepositoriesFrom(undefined)).toEqual([]);
    expect(skillRepositoriesFrom(new ConfigReader({}))).toEqual([]);
  });
});

describe('proposableRepositories', () => {
  it('keeps writable github.com repositories only', () => {
    expect(
      proposableRepositories([
        { url: 'https://github.com/giantswarm/agent-platform', readOnly: true },
        { url: 'http://gitea.lab.local/lab/skills', readOnly: false },
        { url: 'https://github.com/giantswarm/skills', readOnly: false },
      ]),
    ).toEqual(['https://github.com/giantswarm/skills']);
  });
});

describe('canProposeSkillChange', () => {
  it('refuses a read-only skill and one outside github.com', () => {
    const repoUrl = 'https://github.com/giantswarm/skills';
    expect(canProposeSkillChange({ repoUrl })).toBe(true);
    expect(canProposeSkillChange({ repoUrl, readOnly: true })).toBe(false);
    expect(
      canProposeSkillChange({ repoUrl: 'http://gitea.lab.local/lab/skills' }),
    ).toBe(false);
  });
});
