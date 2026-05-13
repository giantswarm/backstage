import type { KlausInstanceConfig } from './config';
import {
  PROVIDER_NAME,
  buildPersonalityEntity,
} from './buildPersonalityEntity';
import type { DiscoveredPersonality } from './discoverPersonalities';

const publicInstance: KlausInstanceConfig = {
  id: 'public',
  system: 'klaus',
  owner: 'team-bumblebee',
  namePostfix: '',
  titlePostfix: '',
  tags: ['public'],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
  personalities: {
    kind: 'personalities',
    sourceRepository: 'https://github.com/giantswarm/klaus-personalities',
    owner: 'giantswarm',
    repo: 'klaus-personalities',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-personalities',
  },
  toolchains: {
    kind: 'toolchains',
    sourceRepository: 'https://github.com/giantswarm/klaus-toolchains',
    owner: 'giantswarm',
    repo: 'klaus-toolchains',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains',
  },
  plugins: {
    kind: 'plugins',
    sourceRepository: 'https://github.com/giantswarm/klaus-plugins',
    owner: 'giantswarm',
    repo: 'klaus-plugins',
    ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-plugins',
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
  personalities: {
    kind: 'personalities',
    sourceRepository:
      'https://github.com/giantswarm/klaus-personalities-internal',
    owner: 'giantswarm',
    repo: 'klaus-personalities-internal',
    ociRepository: 'gsociprivate.azurecr.io/giantswarm/klaus-personalities',
  },
  toolchains: {
    kind: 'toolchains',
    sourceRepository: 'https://github.com/giantswarm/klaus-toolchains-internal',
    owner: 'giantswarm',
    repo: 'klaus-toolchains-internal',
    ociRepository: 'gsociprivate.azurecr.io/giantswarm/klaus-toolchains',
  },
  plugins: {
    kind: 'plugins',
    sourceRepository: 'https://github.com/giantswarm/klaus-plugins-internal',
    owner: 'giantswarm',
    repo: 'klaus-plugins-internal',
    ociRepository: 'gsociprivate.azurecr.io/giantswarm/klaus-plugins',
  },
};

const instances = [publicInstance, internalInstance];

const publicSrePersonality: DiscoveredPersonality = {
  name: 'sre',
  source: publicInstance.personalities!,
  branch: 'main',
  toolchain: {
    repository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains/go',
    tag: '0.1.12',
  },
  plugins: [],
};

const internalSrePersonality: DiscoveredPersonality = {
  name: 'sre',
  source: internalInstance.personalities!,
  branch: 'main',
  toolchain: {
    repository: 'gsociprivate.azurecr.io/giantswarm/klaus-toolchains/go',
    tag: '0.1.26',
  },
  plugins: [
    {
      repository: 'gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base',
      tag: 'v0.9.0',
    },
  ],
};

describe('buildPersonalityEntity', () => {
  it('builds a Component entity for a public personality', () => {
    const result = buildPersonalityEntity({
      personality: publicSrePersonality,
      instance: publicInstance,
      instances,
    });

    expect(result.locationKey).toBe(
      `${PROVIDER_NAME}:public:giantswarm/klaus-personalities/personalities/sre`,
    );
    expect(result.entity).toMatchObject({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'klaus-personality-sre',
        title: 'sre personality',
        tags: ['klaus-personality', 'public'],
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/klaus-personalities/tree/main/personalities/sre',
          'github.com/project-slug': 'giantswarm/klaus-personalities',
          'giantswarm.io/release-tag-prefix': 'sre/',
          'giantswarm.io/klaus-soul-url':
            'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/sre/SOUL.md',
          'giantswarm.io/oci-repository':
            'gsoci.azurecr.io/giantswarm/klaus-personalities/sre',
        },
      },
      spec: {
        type: 'klaus-personality',
        lifecycle: 'production',
        owner: 'team-bumblebee',
        system: 'klaus',
        subcomponentOf: 'component:default/klaus-personalities',
        dependsOn: ['component:default/klaus-toolchain-go'],
      },
    });
  });

  it('applies namePostfix, titlePostfix, and tags from the internal instance and resolves cross-instance plugin refs', () => {
    const result = buildPersonalityEntity({
      personality: internalSrePersonality,
      instance: internalInstance,
      instances,
    });

    expect(result.entity.metadata.name).toBe('klaus-personality-sre-internal');
    expect(result.entity.metadata.title).toBe('sre personality (internal)');
    expect(result.entity.metadata.tags).toEqual([
      'klaus-personality',
      'internal',
    ]);
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('component:default/klaus-personalities-internal');
    expect((result.entity.spec as { dependsOn: string[] }).dependsOn).toEqual([
      'component:default/klaus-toolchain-go-internal',
      'component:default/klaus-plugin-gs-base-internal',
    ]);
    expect(
      result.entity.metadata.annotations?.['giantswarm.io/oci-repository'],
    ).toBe('gsociprivate.azurecr.io/giantswarm/klaus-personalities/sre');
  });

  it('omits dependsOn when toolchain info is missing', () => {
    const result = buildPersonalityEntity({
      personality: { ...publicSrePersonality, toolchain: undefined },
      instance: publicInstance,
      instances,
    });
    expect(
      (result.entity.spec as { dependsOn?: string[] }).dependsOn,
    ).toBeUndefined();
  });

  it('omits dependsOn when the toolchain ref cannot be resolved', () => {
    const result = buildPersonalityEntity({
      personality: {
        ...publicSrePersonality,
        toolchain: {
          repository: 'unknown.example.com/foo/bar/baz',
          tag: '1.0.0',
        },
      },
      instance: publicInstance,
      instances,
    });
    expect(
      (result.entity.spec as { dependsOn?: string[] }).dependsOn,
    ).toBeUndefined();
  });

  it('omits system when not configured but always emits owner', () => {
    const result = buildPersonalityEntity({
      personality: publicSrePersonality,
      instance: {
        ...publicInstance,
        system: undefined,
      },
      instances,
    });
    expect((result.entity.spec as { system?: string }).system).toBeUndefined();
    expect((result.entity.spec as { owner: string }).owner).toBe(
      'team-bumblebee',
    );
  });

  it('places the entity in the configured namespace and uses it in subcomponentOf', () => {
    const result = buildPersonalityEntity({
      personality: publicSrePersonality,
      instance: { ...publicInstance, namespace: 'klaus' },
      instances: [{ ...publicInstance, namespace: 'klaus' }],
    });
    expect(result.entity.metadata.namespace).toBe('klaus');
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('component:klaus/klaus-personalities');
  });

  it('uses the discovered branch in URLs', () => {
    const result = buildPersonalityEntity({
      personality: { ...publicSrePersonality, branch: 'develop' },
      instance: publicInstance,
      instances,
    });
    expect(
      result.entity.metadata.annotations?.['backstage.io/source-location'],
    ).toBe(
      'url:https://github.com/giantswarm/klaus-personalities/tree/develop/personalities/sre',
    );
  });
});
