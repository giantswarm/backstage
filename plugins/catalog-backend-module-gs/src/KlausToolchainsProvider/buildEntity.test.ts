import { buildToolchainEntity, PROVIDER_NAME } from './buildEntity';
import type { DiscoveredToolchain } from './discoverToolchains';

const basePublic: DiscoveredToolchain = {
  name: 'go',
  dirName: 'klaus-go',
  source: {
    owner: 'giantswarm',
    repo: 'klaus-toolchains',
    internal: false,
    ociRegistry: 'gsoci.azurecr.io',
  },
  branch: 'main',
};

const baseInternal: DiscoveredToolchain = {
  name: 'python',
  dirName: 'klaus-python',
  source: {
    owner: 'giantswarm',
    repo: 'klaus-toolchains-internal',
    internal: true,
    ociRegistry: 'gsociprivate.azurecr.io',
  },
  branch: 'main',
};

describe('buildToolchainEntity', () => {
  it('builds a Component entity for a public toolchain', () => {
    const result = buildToolchainEntity(basePublic);

    expect(result.locationKey).toBe(
      `${PROVIDER_NAME}:giantswarm/klaus-toolchains/klaus-go`,
    );
    expect(result.entity).toMatchObject({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'klaus-toolchain-go',
        title: 'go toolchain',
        tags: ['klaus-toolchain', 'public'],
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/klaus-toolchains/tree/main/klaus-go',
          'backstage.io/managed-by-location':
            'url:https://github.com/giantswarm/klaus-toolchains',
          'backstage.io/managed-by-origin-location':
            'url:https://github.com/giantswarm/klaus-toolchains',
          'github.com/project-slug': 'giantswarm/klaus-toolchains',
          'giantswarm.io/klaus-toolchain-image':
            'gsoci.azurecr.io/giantswarm/klaus-toolchains/go',
          'giantswarm.io/klaus-toolchain-dockerfile-url':
            'https://github.com/giantswarm/klaus-toolchains/blob/main/klaus-go/Dockerfile',
        },
      },
      spec: {
        type: 'klaus-toolchain',
        lifecycle: 'production',
        owner: 'team-bumblebee',
        system: 'klaus',
        subcomponentOf: 'klaus-toolchains',
      },
    });
  });

  it('uses -internal name suffix and is a subcomponent of the internal parent', () => {
    const result = buildToolchainEntity(baseInternal);

    expect(result.entity.metadata.name).toBe('klaus-toolchain-python-internal');
    expect(result.entity.metadata.title).toBe('python toolchain (internal)');
    expect(result.entity.metadata.tags).toEqual([
      'klaus-toolchain',
      'internal',
    ]);
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('klaus-toolchains-internal');
    expect(
      result.entity.metadata.annotations?.[
        'giantswarm.io/klaus-toolchain-image'
      ],
    ).toBe(
      'gsociprivate.azurecr.io/giantswarm/klaus-toolchains-internal/python',
    );
  });

  it('uses the discovered branch in URLs', () => {
    const result = buildToolchainEntity({ ...basePublic, branch: 'develop' });
    expect(
      result.entity.metadata.annotations?.['backstage.io/source-location'],
    ).toBe(
      'url:https://github.com/giantswarm/klaus-toolchains/tree/develop/klaus-go',
    );
    expect(
      result.entity.metadata.annotations?.[
        'giantswarm.io/klaus-toolchain-dockerfile-url'
      ],
    ).toBe(
      'https://github.com/giantswarm/klaus-toolchains/blob/develop/klaus-go/Dockerfile',
    );
  });
});
