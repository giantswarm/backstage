import { ConfigReader } from '@backstage/config';
import {
  canProposeTo,
  normalizeScanPath,
  proposableRepositories,
  skillRepositoriesFrom,
} from './skillRepositories';
import { canProposeSkillChange, readOnlyReason } from './skills';

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
            path: './skills/',
            readOnly: true,
          },
          { ref: 'main' },
          { url: 'https://github.com/a/b', path: '../etc' },
          '',
        ]),
      ),
    ).toEqual([
      {
        url: 'https://github.com/giantswarm/agent-skills',
        path: '',
        readOnly: false,
      },
      {
        url: 'https://github.com/giantswarm/agent-platform',
        ref: 'v1.2.3',
        path: 'skills',
        readOnly: true,
      },
    ]);
  });

  it('keeps the first entry of a URL listed twice, as the backend does', () => {
    expect(
      skillRepositoriesFrom(
        configWith([
          {
            url: 'https://github.com/giantswarm/agent-platform',
            readOnly: true,
          },
          'https://github.com/GiantSwarm/agent-platform.git/',
        ]),
      ),
    ).toEqual([
      {
        url: 'https://github.com/giantswarm/agent-platform',
        path: '',
        readOnly: true,
      },
    ]);
  });

  it('answers nothing without config', () => {
    expect(skillRepositoriesFrom(undefined)).toEqual([]);
    expect(skillRepositoriesFrom(new ConfigReader({}))).toEqual([]);
  });
});

describe('normalizeScanPath', () => {
  it.each([
    ['.', ''],
    ['skills//x/', 'skills/x'],
    ['./skills/./x', 'skills/x'],
    ['a/../b', undefined],
  ])('%p is %p', (path, expected) => {
    expect(normalizeScanPath(path)).toBe(expected);
  });
});

describe('proposableRepositories', () => {
  const entry = (url: string, extra = {}) => ({
    url,
    path: '',
    readOnly: false,
    ...extra,
  });

  it('keeps writable github.com repositories read on a branch', () => {
    expect(
      proposableRepositories(
        [
          entry('https://github.com/giantswarm/agent-platform', {
            readOnly: true,
          }),
          entry('http://gitea.lab.local/lab/skills'),
          entry('https://github.com/giantswarm/skills'),
          entry('https://github.com/giantswarm/develop', { ref: 'develop' }),
          entry('https://github.com/giantswarm/tagged', { ref: 'v1' }),
        ],
        {
          'https://github.com/giantswarm/develop': 'branch',
          'https://github.com/giantswarm/tagged': 'tag',
        },
      ).map(r => r.url),
    ).toEqual([
      'https://github.com/giantswarm/skills',
      'https://github.com/giantswarm/develop',
    ]);
  });

  it('never targets a commit, and waits for discovery to know a ref', () => {
    expect(
      canProposeTo(entry('https://github.com/a/b', { ref: 'a'.repeat(40) }), {
        'https://github.com/a/b': 'branch',
      }),
    ).toBe(false);
    expect(canProposeTo(entry('https://github.com/a/b', { ref: 'x' }))).toBe(
      false,
    );
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
