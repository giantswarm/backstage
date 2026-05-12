import { buildPersonalityEntity, PROVIDER_NAME } from './buildEntity';
import type { DiscoveredPersonality } from './discoverPersonalities';

const basePublic: DiscoveredPersonality = {
  name: 'sre',
  source: {
    owner: 'giantswarm',
    repo: 'klaus-personalities',
    internal: false,
    ociRegistry: 'gsoci.azurecr.io',
  },
  branch: 'main',
  toolchain: {
    repository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains/go',
    tag: '0.1.12',
  },
  plugins: [],
};

const baseInternal: DiscoveredPersonality = {
  name: 'sre',
  source: {
    owner: 'giantswarm',
    repo: 'klaus-personalities-internal',
    internal: true,
    ociRegistry: 'gsociprivate.azurecr.io',
  },
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
    const result = buildPersonalityEntity(basePublic);

    expect(result.locationKey).toBe(
      `${PROVIDER_NAME}:giantswarm/klaus-personalities/personalities/sre`,
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
          'backstage.io/managed-by-location':
            'url:https://github.com/giantswarm/klaus-personalities',
          'backstage.io/managed-by-origin-location':
            'url:https://github.com/giantswarm/klaus-personalities',
          'github.com/project-slug': 'giantswarm/klaus-personalities',
          'giantswarm.io/release-tag-prefix': 'sre/',
          'giantswarm.io/klaus-soul-url':
            'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/sre/SOUL.md',
          'giantswarm.io/klaus-personality-yaml-url':
            'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/sre/personality.yaml',
          'giantswarm.io/klaus-personality-image':
            'gsoci.azurecr.io/giantswarm/klaus-personalities/sre',
          'giantswarm.io/klaus-personality-toolchain':
            'gsoci.azurecr.io/giantswarm/klaus-toolchains/go:0.1.12',
        },
      },
      spec: {
        type: 'klaus-personality',
        lifecycle: 'production',
        owner: 'team-bumblebee',
        system: 'klaus',
        subcomponentOf: 'klaus-personalities',
        dependsOn: ['component:default/klaus-toolchain-go'],
      },
    });
  });

  it('uses -internal name suffix and is a subcomponent of the internal parent', () => {
    const result = buildPersonalityEntity(baseInternal);

    expect(result.entity.metadata.name).toBe('klaus-personality-sre-internal');
    expect(result.entity.metadata.title).toBe('sre personality (internal)');
    expect(result.entity.metadata.tags).toEqual([
      'klaus-personality',
      'internal',
    ]);
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('klaus-personalities-internal');
    expect((result.entity.spec as { dependsOn: string[] }).dependsOn).toEqual([
      'component:default/klaus-toolchain-go-internal',
    ]);
    expect(
      result.entity.metadata.annotations?.[
        'giantswarm.io/klaus-personality-toolchain'
      ],
    ).toBe('gsociprivate.azurecr.io/giantswarm/klaus-toolchains/go:0.1.26');
  });

  it('omits the toolchain annotation and dependsOn link when toolchain info is missing', () => {
    const result = buildPersonalityEntity({
      ...basePublic,
      toolchain: undefined,
    });
    expect(
      result.entity.metadata.annotations?.[
        'giantswarm.io/klaus-personality-toolchain'
      ],
    ).toBeUndefined();
    expect(
      (result.entity.spec as { dependsOn?: string[] }).dependsOn,
    ).toBeUndefined();
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('klaus-personalities');
  });

  it('omits the toolchain dependsOn link when toolchain.repository is malformed', () => {
    const result = buildPersonalityEntity({
      ...basePublic,
      toolchain: { repository: 'no-slashes-here', tag: '1.0.0' },
    });
    expect(
      (result.entity.spec as { dependsOn?: string[] }).dependsOn,
    ).toBeUndefined();
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('klaus-personalities');
  });

  it('uses the discovered branch in URLs', () => {
    const result = buildPersonalityEntity({ ...basePublic, branch: 'develop' });
    expect(
      result.entity.metadata.annotations?.['backstage.io/source-location'],
    ).toBe(
      'url:https://github.com/giantswarm/klaus-personalities/tree/develop/personalities/sre',
    );
    expect(
      result.entity.metadata.annotations?.['giantswarm.io/klaus-soul-url'],
    ).toBe(
      'https://github.com/giantswarm/klaus-personalities/blob/develop/personalities/sre/SOUL.md',
    );
  });
});
