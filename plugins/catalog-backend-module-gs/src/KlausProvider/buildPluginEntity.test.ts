import type { KlausInstanceConfig } from './config';
import { buildPluginEntity } from './buildPluginEntity';
import { PROVIDER_NAME } from './buildPersonalityEntity';
import type { DiscoveredPlugin } from './discoverPlugins';

const publicInstance: KlausInstanceConfig = {
  id: 'public',
  system: 'klaus',
  owner: 'team-bumblebee',
  namePostfix: '',
  titlePostfix: '',
  tags: ['public'],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
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
  plugins: {
    kind: 'plugins',
    sourceRepository: 'https://github.com/giantswarm/klaus-plugins-internal',
    owner: 'giantswarm',
    repo: 'klaus-plugins-internal',
    ociRepository: 'gsociprivate.azurecr.io/giantswarm/klaus-plugins',
  },
};

const publicBasePlugin: DiscoveredPlugin = {
  name: 'base',
  source: publicInstance.plugins!,
  branch: 'main',
  description: 'Base plugin',
  pluginDir: 'plugins/base',
};

describe('buildPluginEntity', () => {
  it('builds a Component entity for a public plugin', () => {
    const result = buildPluginEntity({
      plugin: publicBasePlugin,
      instance: publicInstance,
    });

    expect(result.locationKey).toBe(
      `${PROVIDER_NAME}:public:giantswarm/klaus-plugins/plugins/base`,
    );
    expect(result.entity).toMatchObject({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'klaus-plugin-base',
        title: 'base plugin',
        description: 'Base plugin',
        tags: ['klaus-plugin', 'public'],
        annotations: {
          'backstage.io/source-location':
            'url:https://github.com/giantswarm/klaus-plugins/tree/main/plugins/base',
          'github.com/project-slug': 'giantswarm/klaus-plugins',
          'giantswarm.io/release-tag-prefix': 'base/',
          'giantswarm.io/oci-repository':
            'gsoci.azurecr.io/giantswarm/klaus-plugins/base',
        },
      },
      spec: {
        type: 'klaus-plugin',
        lifecycle: 'production',
        owner: 'team-bumblebee',
        system: 'klaus',
        subcomponentOf: 'component:default/klaus-plugins',
      },
    });
  });

  it('applies namePostfix, titlePostfix, tags, and internal ociRepository', () => {
    const result = buildPluginEntity({
      plugin: {
        ...publicBasePlugin,
        name: 'gs-base',
        source: internalInstance.plugins!,
        pluginDir: 'plugins/gs-base',
      },
      instance: internalInstance,
    });
    expect(result.entity.metadata.name).toBe('klaus-plugin-gs-base-internal');
    expect(result.entity.metadata.title).toBe('gs-base plugin (internal)');
    expect(result.entity.metadata.tags).toEqual(['klaus-plugin', 'internal']);
    expect(
      result.entity.metadata.annotations?.['giantswarm.io/oci-repository'],
    ).toBe('gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base');
    expect(
      (result.entity.spec as { subcomponentOf: string }).subcomponentOf,
    ).toBe('component:default/klaus-plugins-internal');
  });

  it('falls back to a generated description when none is provided', () => {
    const result = buildPluginEntity({
      plugin: { ...publicBasePlugin, description: undefined },
      instance: publicInstance,
    });
    expect(result.entity.metadata.description).toBe(
      'Klaus plugin "base" from giantswarm/klaus-plugins.',
    );
  });

  it('omits system when not configured but always emits owner', () => {
    const result = buildPluginEntity({
      plugin: publicBasePlugin,
      instance: { ...publicInstance, system: undefined },
    });
    expect((result.entity.spec as { system?: string }).system).toBeUndefined();
    expect((result.entity.spec as { owner: string }).owner).toBe(
      'team-bumblebee',
    );
  });

  it('uses the discovered branch in URLs', () => {
    const result = buildPluginEntity({
      plugin: { ...publicBasePlugin, branch: 'develop' },
      instance: publicInstance,
    });
    expect(
      result.entity.metadata.annotations?.['backstage.io/source-location'],
    ).toBe(
      'url:https://github.com/giantswarm/klaus-plugins/tree/develop/plugins/base',
    );
  });
});
