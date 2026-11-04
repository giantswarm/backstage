import { mockServices } from '@backstage/backend-test-utils';
import { JsonValue } from '@backstage/types';
import {
  findSkillRepository,
  isBelowPath,
  normalizeScanPath,
  readSkillRepositories,
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
    ).toEqual([{ url: 'https://github.com/a/c', path: '', readOnly: false }]);
    expect(logger.error).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenLastCalledWith(
      'agentPlatform.skills.repositories[4] ignored: https://github.com/A/c.git/ is already listed',
    );
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

  it('finds an entry by any spelling of its URL', () => {
    const config = configWith([
      { url: 'https://github.com/giantswarm/agent-platform', readOnly: true },
    ]);
    expect(
      findSkillRepository(
        config,
        'https://github.com/GiantSwarm/agent-platform.git/',
      )?.readOnly,
    ).toBe(true);
    expect(
      findSkillRepository(config, 'https://github.com/x/y'),
    ).toBeUndefined();
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
