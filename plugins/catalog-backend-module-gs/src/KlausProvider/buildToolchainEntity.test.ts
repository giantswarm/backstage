import type { KlausInstanceConfig } from './config';
import { buildToolchainEntity } from './buildToolchainEntity';
import { PROVIDER_NAME } from './buildPersonalityEntity';
import type { DiscoveredToolchain } from './discoverToolchains';

const publicInstance: KlausInstanceConfig = {
  id: 'public',
  system: 'klaus',
  owner: 'team-bumblebee',
  namePostfix: '',
  titlePostfix: '',
  tags: ['public'],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
  toolchains: {
    kind: 'toolchains',
    sourceRepository: 'https://github.com/giantswarm/klaus-toolchains',
    owner: 'giantswarm',
    repo: 'klaus-toolchains',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains',
  },
};

const internalInstance: KlausInstanceConfig = {
  id: 'internal',
  system: 'klaus',
  owner: 'team-bumblebee',
  namePostfix: '-internal',
  titlePostfix: ' (internal)',
  tags: ['internal'],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
  toolchains: {
    kind: 'toolchains',
    sourceRepository: 'https://github.com/giantswarm/klaus-toolchains-internal',
    owner: 'giantswarm',
    repo: 'klaus-toolchains-internal',
    ociRepository: 'gsociprivate.azurecr.io/giantswarm/klaus-toolchains',
  },
};

const publicGoToolchain: DiscoveredToolchain = {
  name: 'go',
  dirName: 'klaus-go',
  source: publicInstance.toolchains!,
  branch: 'main',
};

const internalGoToolchain: DiscoveredToolchain = {
  name: 'go',
  dirName: 'klaus-go',
  source: internalInstance.toolchains!,
  branch: 'main',
};

describe('buildToolchainEntity', () => {
  it('builds a Component entity for a public toolchain', () => {
    const result = buildToolchainEntity({
      toolchain: publicGoToolchain,
      instance: publicInstance,
    });

    expect(result.locationKey).toBe(
      `${PROVIDER_NAME}:public:giantswarm/klaus-toolchains/klaus-go`,
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
          'github.com/project-slug': 'giantswarm/klaus-toolchains',
          'giantswarm.io/release-tag-prefix': 'go/',
          'giantswarm.io/oci-repository':
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
        subcomponentOf: 'component:default/klaus-toolchains',
      },
    });
  });

  it('applies namePostfix, titlePostfix, tags, and internal ociRepository', () => {
    const result = buildToolchainEntity({
      toolchain: internalGoToolchain,
      instance: internalInstance,
    });

    expect(result.entity.metadata.name).toBe('klaus-toolchain-go-internal');
    expect(result.entity.metadata.title).toBe('go toolchain (internal)');
    expect(result.entity.metadata.tags).toEqual([
      'klaus-toolchain',
      'internal',
    ]);
    expect(
      result.entity.metadata.annotations?.['giantswarm.io/oci-repository'],
    ).toBe('gsociprivate.azurecr.io/giantswarm/klaus-toolchains/go');
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('component:default/klaus-toolchains-internal');
  });

  it('omits system when not configured but always emits owner', () => {
    const result = buildToolchainEntity({
      toolchain: publicGoToolchain,
      instance: { ...publicInstance, system: undefined },
    });
    expect((result.entity.spec as { system?: string }).system).toBeUndefined();
    expect((result.entity.spec as { owner: string }).owner).toBe(
      'team-bumblebee',
    );
  });

  it('uses the discovered branch in URLs', () => {
    const result = buildToolchainEntity({
      toolchain: { ...publicGoToolchain, branch: 'develop' },
      instance: publicInstance,
    });
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
