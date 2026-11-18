import { mockServices } from '@backstage/backend-test-utils';
import { JsonValue } from '@backstage/types';
import { isBelowPath, parseConfiguredRef } from './skillFiles';
import {
  normalizeScanPath,
  pullRequestBase,
  readSkillRepositories,
  skillRepositoriesByKey,
} from './skillRepositories';

function configWith(repositories: JsonValue) {
  return mockServices.rootConfig({
    data: { agentPlatform: { skills: { repositories } } },
  });
}

describe('readSkillRepositories', () => {
  it('reads plain URLs and objects alike', () => {
    expect(
      readSkillRepositories(
        configWith([
          ' https://github.com/giantswarm/agent-skills ',
          {
            url: 'https://github.com/giantswarm/agent-platform',
            ref: 'v1.2.3',
            path: './skills/',
            readOnly: true,
          },
          { url: 'http://git.local/skills.git', ref: '' },
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
      {
        url: 'http://git.local/skills.git',
        ref: undefined,
        path: '',
        readOnly: false,
      },
    ]);
  });

  it('leaves malformed entries and repeated URLs out, logging each', () => {
    const logger = mockServices.logger.mock();
    expect(
      readSkillRepositories(
        configWith([
          { ref: 'main' },
          { url: 'https://github.com/a/b', path: '../etc' },
          '',
          'https://github.com/a/c',
          { url: 'https://github.com/A/c.git/', readOnly: true },
        ]),
        logger,
      ),
    ).toEqual([{ url: 'https://github.com/a/c', path: '', readOnly: true }]);
    // A handled outcome: info, the URL and index in metadata.
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(4);
    expect(logger.info).toHaveBeenLastCalledWith(
      'Skill repository entry ignored',
      expect.objectContaining({
        index: 4,
        url: 'https://github.com/A/c.git/',
        reason: 'url is already listed',
      }),
    );
  });

  it('keeps a URL read-only when any entry for it says so', () => {
    expect(
      readSkillRepositories(
        configWith([
          'https://github.com/giantswarm/agent-platform',
          {
            url: 'https://github.com/giantswarm/agent-platform',
            path: 'skills',
            readOnly: true,
          },
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

  it.each([
    ['.', ''],
    ['./', ''],
    ['skills//x/', 'skills/x'],
    ['./skills/./x', 'skills/x'],
    ['/skills', 'skills'],
    ['a/../b', undefined],
  ])('normalizes the path %p to %p', (path, expected) => {
    expect(normalizeScanPath(path)).toBe(expected);
  });

  it('answers nothing when unset', () => {
    expect(readSkillRepositories(mockServices.rootConfig())).toEqual([]);
  });

  it('keys the entries the way the caches key a URL', () => {
    const byKey = skillRepositoriesByKey(
      configWith([
        { url: 'https://github.com/GiantSwarm/agent-platform.git/' },
      ]),
    );
    expect([...byKey.keys()]).toEqual([
      'https://github.com/giantswarm/agent-platform',
    ]);
  });
});

describe('pullRequestBase', () => {
  const at = (ref?: string) => ({
    url: 'https://github.com/a/b',
    path: '',
    readOnly: false,
    ...(ref ? { ref } : {}),
  });
  it.each([
    [undefined, undefined],
    ['develop', 'develop'],
    ['refs/heads/develop', 'develop'],
    ['refs/tags/v1', null],
    ['a'.repeat(40), null],
  ])('%p takes pull requests into %p', (ref, expected) => {
    expect(pullRequestBase(at(ref))).toBe(expected);
  });
});

describe('parseConfiguredRef', () => {
  it.each([
    ['main', { form: 'name', name: 'main' }],
    ['refs/heads/main', { form: 'branch', name: 'main' }],
    ['refs/tags/v1', { form: 'tag', name: 'v1' }],
    ['b'.repeat(40), { form: 'commit', name: 'b'.repeat(40) }],
  ])('%p is %p', (ref, expected) => {
    expect(parseConfiguredRef(ref)).toEqual(expected);
  });
});

describe('isBelowPath', () => {
  it.each([
    ['skills/a', 'skills', true],
    ['skills', 'skills', true],
    ['skillset/a', 'skills', false],
    ['', 'skills', false],
    ['anything', '', true],
  ])('%s below %s: %s', (path, scanPath, expected) => {
    expect(isBelowPath(path, scanPath)).toBe(expected);
  });
});
