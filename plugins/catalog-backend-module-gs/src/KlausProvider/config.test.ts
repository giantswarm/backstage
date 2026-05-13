import { ConfigReader } from '@backstage/config';
import { parseGithubRepoUrl, readKlausInstanceConfigs } from './config';

describe('parseGithubRepoUrl', () => {
  it.each([
    [
      'https://github.com/giantswarm/klaus-personalities',
      'giantswarm',
      'klaus-personalities',
    ],
    ['http://github.com/foo/bar', 'foo', 'bar'],
    ['https://github.com/foo/bar/', 'foo', 'bar'],
    ['https://github.com/foo/bar.git', 'foo', 'bar'],
    ['  https://github.com/foo/bar  ', 'foo', 'bar'],
  ])('parses %s', (url, owner, repo) => {
    expect(parseGithubRepoUrl(url)).toEqual({ owner, repo });
  });

  it.each([
    'github.com/foo/bar',
    'https://gitlab.com/foo/bar',
    'https://github.com/foo',
    'not a url',
  ])('rejects %s', url => {
    expect(() => parseGithubRepoUrl(url)).toThrow(
      /Invalid GitHub repository URL/,
    );
  });
});

describe('readKlausInstanceConfigs', () => {
  it('returns an empty list when no klaus config is present', () => {
    const config = new ConfigReader({ catalog: { providers: {} } });
    expect(readKlausInstanceConfigs(config)).toEqual([]);
  });

  it('parses one instance with all three sources', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          klaus: {
            public: {
              owner: 'team-bumblebee',
              tags: ['public'],
              personalities: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-personalities',
                ociRepository:
                  'gsoci.azurecr.io/giantswarm/klaus-personalities',
              },
              toolchains: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-toolchains',
                ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains',
              },
              plugins: {
                sourceRepository: 'https://github.com/giantswarm/klaus-plugins',
                ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-plugins',
              },
            },
          },
        },
      },
    });

    const instances = readKlausInstanceConfigs(config);

    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      id: 'public',
      namePostfix: '',
      titlePostfix: '',
      tags: ['public'],
      personalities: {
        kind: 'personalities',
        owner: 'giantswarm',
        repo: 'klaus-personalities',
        ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-personalities',
      },
      toolchains: {
        kind: 'toolchains',
        owner: 'giantswarm',
        repo: 'klaus-toolchains',
      },
      plugins: {
        kind: 'plugins',
        owner: 'giantswarm',
        repo: 'klaus-plugins',
      },
    });
  });

  it('parses multiple instances with postfix and optional sources', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          klaus: {
            public: {
              system: 'klaus',
              owner: 'team-bumblebee',
              personalities: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-personalities',
                ociRepository:
                  'gsoci.azurecr.io/giantswarm/klaus-personalities',
              },
            },
            internal: {
              owner: 'team-bumblebee',
              namePostfix: '-internal',
              titlePostfix: ' (internal)',
              toolchains: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-toolchains-internal',
                ociRepository:
                  'gsociprivate.azurecr.io/giantswarm/klaus-toolchains',
              },
            },
          },
        },
      },
    });

    const instances = readKlausInstanceConfigs(config);

    expect(instances.map(i => i.id)).toEqual(['public', 'internal']);
    expect(instances[0].system).toBe('klaus');
    expect(instances[0].owner).toBe('team-bumblebee');
    expect(instances[0].personalities).toBeDefined();
    expect(instances[0].toolchains).toBeUndefined();
    expect(instances[0].plugins).toBeUndefined();
    expect(instances[1].namePostfix).toBe('-internal');
    expect(instances[1].titlePostfix).toBe(' (internal)');
    expect(instances[1].personalities).toBeUndefined();
    expect(instances[1].toolchains).toBeDefined();
  });

  it('strips trailing slashes from ociRepository', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          klaus: {
            public: {
              owner: 'team-bumblebee',
              personalities: {
                sourceRepository:
                  'https://github.com/giantswarm/klaus-personalities',
                ociRepository:
                  'gsoci.azurecr.io/giantswarm/klaus-personalities///',
              },
            },
          },
        },
      },
    });

    const instances = readKlausInstanceConfigs(config);
    expect(instances[0].personalities?.ociRepository).toBe(
      'gsoci.azurecr.io/giantswarm/klaus-personalities',
    );
  });
});
