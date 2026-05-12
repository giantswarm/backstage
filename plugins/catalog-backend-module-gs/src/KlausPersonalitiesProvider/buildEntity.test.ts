import { buildPersonalityEntity, PROVIDER_NAME } from './buildEntity';
import type { DiscoveredPersonality } from './discoverPersonalities';

const basePublic: DiscoveredPersonality = {
  name: 'sre',
  source: {
    owner: 'giantswarm',
    repo: 'klaus-personalities',
    internal: false,
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
        title: 'sre',
        tags: ['klaus-personality', 'public'],
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/klaus-personalities/tree/main/personalities/sre',
          'backstage.io/managed-by-location':
            'url:https://github.com/giantswarm/klaus-personalities',
          'backstage.io/managed-by-origin-location':
            'url:https://github.com/giantswarm/klaus-personalities',
          'github.com/project-slug': 'giantswarm/klaus-personalities',
          'giantswarm.io/klaus-soul-url':
            'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/sre/SOUL.md',
          'giantswarm.io/klaus-personality-yaml-url':
            'https://github.com/giantswarm/klaus-personalities/blob/main/personalities/sre/personality.yaml',
          'giantswarm.io/klaus-personality-toolchain':
            'gsoci.azurecr.io/giantswarm/klaus-toolchains/go:0.1.12',
        },
      },
      spec: {
        type: 'klaus-personality',
        lifecycle: 'production',
        owner: 'team-bumblebee',
        system: 'klaus',
        dependsOn: ['component:default/klaus-personalities'],
      },
    });
  });

  it('uses -internal name suffix and depends on the internal parent', () => {
    const result = buildPersonalityEntity(baseInternal);

    expect(result.entity.metadata.name).toBe('klaus-personality-sre-internal');
    expect(result.entity.metadata.title).toBe('sre (internal)');
    expect(result.entity.metadata.tags).toEqual([
      'klaus-personality',
      'internal',
    ]);
    expect((result.entity.spec as { dependsOn: string[] }).dependsOn).toEqual([
      'component:default/klaus-personalities-internal',
    ]);
    expect(
      result.entity.metadata.annotations?.[
        'giantswarm.io/klaus-personality-toolchain'
      ],
    ).toBe('gsociprivate.azurecr.io/giantswarm/klaus-toolchains/go:0.1.26');
  });

  it('omits the toolchain annotation when toolchain info is missing', () => {
    const result = buildPersonalityEntity({
      ...basePublic,
      toolchain: undefined,
    });
    expect(
      result.entity.metadata.annotations?.[
        'giantswarm.io/klaus-personality-toolchain'
      ],
    ).toBeUndefined();
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
