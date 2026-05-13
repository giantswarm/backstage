import type { KlausInstanceConfig } from './config';
import { resolveEntityRef } from './resolveEntityRef';

const publicInstance: KlausInstanceConfig = {
  id: 'public',
  owner: 'team-bumblebee',
  namePostfix: '',
  titlePostfix: '',
  tags: [],
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
  owner: 'team-bumblebee',
  namePostfix: '-internal',
  titlePostfix: ' (internal)',
  tags: [],
  schedule: { frequency: { hours: 1 }, timeout: { minutes: 1 } },
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

describe('resolveEntityRef', () => {
  it('resolves a public toolchain ref', () => {
    expect(
      resolveEntityRef({
        kind: 'toolchains',
        ociRef: 'gsoci.azurecr.io/giantswarm/klaus-toolchains/go:0.1.12',
        instances,
      }),
    ).toBe('component:default/klaus-toolchain-go');
  });

  it('resolves an internal toolchain ref to the internal entity name', () => {
    expect(
      resolveEntityRef({
        kind: 'toolchains',
        ociRef: 'gsociprivate.azurecr.io/giantswarm/klaus-toolchains/go:0.1.26',
        instances,
      }),
    ).toBe('component:default/klaus-toolchain-go-internal');
  });

  it('resolves a plugin ref against the matching instance', () => {
    expect(
      resolveEntityRef({
        kind: 'plugins',
        ociRef:
          'gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base:v0.9.0',
        instances,
      }),
    ).toBe('component:default/klaus-plugin-gs-base-internal');
  });

  it('returns undefined for unknown registries', () => {
    expect(
      resolveEntityRef({
        kind: 'toolchains',
        ociRef: 'unknown.example.com/foo/bar/go:1.0',
        instances,
      }),
    ).toBeUndefined();
  });

  it('returns undefined for malformed refs without a slash', () => {
    expect(
      resolveEntityRef({
        kind: 'toolchains',
        ociRef: 'no-slashes',
        instances,
      }),
    ).toBeUndefined();
  });

  it('handles refs without an explicit tag', () => {
    expect(
      resolveEntityRef({
        kind: 'plugins',
        ociRef: 'gsoci.azurecr.io/giantswarm/klaus-plugins/base',
        instances,
      }),
    ).toBe('component:default/klaus-plugin-base');
  });

  it("uses the matched instance's namespace in the returned ref", () => {
    const namespacedInstance: KlausInstanceConfig = {
      ...publicInstance,
      id: 'namespaced',
      namespace: 'klaus',
    };
    expect(
      resolveEntityRef({
        kind: 'toolchains',
        ociRef: 'gsoci.azurecr.io/giantswarm/klaus-toolchains/go:0.1.12',
        instances: [namespacedInstance],
      }),
    ).toBe('component:klaus/klaus-toolchain-go');
  });
});
