import { ConfigReader } from '@backstage/config';
import {
  offGitHubSources,
  proposableSources,
  skillRepositoryUrls,
} from './skillRepositories';
import { canProposeSkillChange, readOnlyReason } from './skills';

const configWith = (repositories: unknown) =>
  new ConfigReader({
    agentPlatform: { skills: { repositories } },
  } as never);

describe('skillRepositoryUrls', () => {
  it('reads plain URLs and objects alike, each URL once', () => {
    expect(
      skillRepositoryUrls(
        configWith([
          'https://github.com/giantswarm/agent-skills',
          {
            url: 'https://github.com/giantswarm/agent-platform',
            ref: 'v1.2.3',
            path: 'skills',
            readOnly: true,
          },
          'https://github.com/GiantSwarm/agent-platform.git/',
          { ref: 'main' },
          '',
        ]),
      ),
    ).toEqual([
      'https://github.com/giantswarm/agent-skills',
      'https://github.com/giantswarm/agent-platform',
    ]);
  });

  it('answers nothing without config', () => {
    expect(skillRepositoryUrls(undefined)).toEqual([]);
    expect(skillRepositoryUrls(new ConfigReader({}))).toEqual([]);
  });
});

describe('proposableSources and offGitHubSources', () => {
  const source = (url: string, extra = {}) => ({
    url,
    proposable: false,
    path: '',
    readOnly: false,
    ...extra,
  });
  const sources = [
    source('https://github.com/giantswarm/skills', { proposable: true }),
    source('https://github.com/giantswarm/agent-platform', { readOnly: true }),
    source('http://gitea.lab.local/lab/skills'),
    source('http://gitea.lab.local/lab/platform', { readOnly: true }),
  ];

  it('targets what the backend says takes pull requests', () => {
    expect(proposableSources(sources).map(s => s.url)).toEqual([
      'https://github.com/giantswarm/skills',
    ]);
  });

  it('names the writable sources off github.com', () => {
    expect(offGitHubSources(sources).map(s => s.url)).toEqual([
      'http://gitea.lab.local/lab/skills',
    ]);
  });
});

describe('canProposeSkillChange', () => {
  const repoUrl = 'https://github.com/giantswarm/skills';
  it('refuses a read-only skill, one not on a branch and one outside github.com', () => {
    expect(canProposeSkillChange({ repoUrl })).toBe(true);
    expect(canProposeSkillChange({ repoUrl, readOnly: true })).toBe(false);
    expect(canProposeSkillChange({ repoUrl, refKind: 'tag' })).toBe(false);
    expect(
      canProposeSkillChange({ repoUrl: 'http://gitea.lab.local/lab/skills' }),
    ).toBe(false);
  });

  it('says why', () => {
    expect(readOnlyReason({ ref: 'v1', readOnly: true })).toBe(
      'This skill comes from a read-only source.',
    );
    expect(readOnlyReason({ ref: 'v1', refKind: 'tag' })).toBe(
      'This skill is read at v1, not a branch.',
    );
  });
});
