import { renderHook } from '@testing-library/react';
import {
  GitRepository,
  HelmRelease,
  KubeObject,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useGitOpsSource } from './useGitOpsSource';

const mockUseResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

const KUSTOMIZE_LABELS = {
  'kustomize.toolkit.fluxcd.io/name': 'flux-extras',
  'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
};

const HELM_LABELS = {
  'helm.toolkit.fluxcd.io/name': 'agent-platform-mcps',
  'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
};

function makeResource(labels: Record<string, string>): KubeObject {
  return new KubeObject(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'github', namespace: 'agent-platform', labels },
    } as never,
    'gazelle',
  );
}

function makeHelmRelease(
  labels: Record<string, string> = {},
  name = 'agent-platform-mcps',
) {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: {
        name,
        namespace: 'agent-platform',
        labels,
      },
      spec: {},
    } as never,
    'gazelle',
  );
}

function makeKustomization() {
  return new Kustomization(
    {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: { name: 'flux-extras', namespace: 'flux-giantswarm' },
      spec: {
        path: './management-clusters/gazelle/extras',
        sourceRef: { kind: 'GitRepository', name: 'management-clusters' },
      },
    } as never,
    'gazelle',
  );
}

function makeGitRepository() {
  return new GitRepository(
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'GitRepository',
      metadata: { name: 'management-clusters', namespace: 'flux-giantswarm' },
      spec: { url: 'https://github.com/giantswarm/management-clusters' },
      status: { artifact: { revision: 'main@sha1:abc123' } },
    } as never,
    'gazelle',
  );
}

function stubChain(chain: {
  helmRelease?: unknown;
  kustomization?: unknown;
  gitRepository?: unknown;
  kustomizationError?: Error;
}) {
  mockUseResource.mockImplementation(
    (_cluster: string, ResourceClass: unknown) => {
      const failed =
        ResourceClass === Kustomization ? chain.kustomizationError : undefined;
      let resource;
      if (ResourceClass === HelmRelease) resource = chain.helmRelease;
      if (ResourceClass === Kustomization) resource = chain.kustomization;
      if (ResourceClass === GitRepository) resource = chain.gitRepository;
      return {
        resource,
        isLoading: false,
        error: failed ?? null,
        errors: failed
          ? [{ type: 'error', cluster: 'gazelle', error: failed }]
          : [],
        incompatibilities: [],
        discoveryErrors: [],
        clientOutdatedStates: [],
      };
    },
  );
}

const render = (resource: KubeObject) =>
  renderHook(() => useGitOpsSource(resource, 'gazelle')).result.current;

describe('useGitOpsSource', () => {
  beforeEach(() => {
    mockUseResource.mockReset();
  });

  it('resolves a resource applied by a Kustomization to its source', () => {
    stubChain({
      kustomization: makeKustomization(),
      gitRepository: makeGitRepository(),
    });

    const source = render(makeResource(KUSTOMIZE_LABELS));

    expect(source.inGit).toBe(true);
    expect(source.helmRelease).toBeUndefined();
    expect(source.kustomization).toEqual({
      name: 'flux-extras',
      namespace: 'flux-giantswarm',
      path: './management-clusters/gazelle/extras',
    });
    expect(source.url).toBe(
      'https://github.com/giantswarm/management-clusters/tree/abc123/management-clusters/gazelle/extras',
    );
    expect(source.changeRequestTerm).toBe('pull request');
    expect(source.errors).toEqual([]);
  });

  it('names the HelmRelease a chart-rendered resource was found through', () => {
    stubChain({
      helmRelease: makeHelmRelease(KUSTOMIZE_LABELS),
      kustomization: makeKustomization(),
      gitRepository: makeGitRepository(),
    });

    const source = render(makeResource(HELM_LABELS));

    expect(source.inGit).toBe(true);
    expect(source.helmRelease).toEqual({
      name: 'agent-platform-mcps',
      namespace: 'agent-platform',
    });
    expect(source.url).toContain('management-clusters/gazelle/extras');
  });

  it('follows a HelmRelease rendered by an umbrella HelmRelease', () => {
    const releases: Record<string, unknown> = {
      'agent-platform-mcps': makeHelmRelease({
        'helm.toolkit.fluxcd.io/name': 'agent-platform',
        'helm.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
      }),
      'agent-platform': makeHelmRelease(KUSTOMIZE_LABELS, 'agent-platform'),
    };
    mockUseResource.mockImplementation(
      (
        _cluster: string,
        ResourceClass: unknown,
        options: { name: string },
        queryOptions: { enabled: boolean },
      ) => {
        let resource;
        if (queryOptions.enabled && ResourceClass === HelmRelease)
          resource = releases[options.name];
        if (ResourceClass === Kustomization) resource = makeKustomization();
        if (ResourceClass === GitRepository) resource = makeGitRepository();
        return {
          resource,
          isLoading: false,
          error: null,
          errors: [],
          incompatibilities: [],
          discoveryErrors: [],
          clientOutdatedStates: [],
        };
      },
    );

    const source = render(makeResource(HELM_LABELS));

    expect(source.inGit).toBe(true);
    // The umbrella's values are what renders the server, so it is the one named.
    expect(source.helmRelease).toEqual({
      name: 'agent-platform',
      namespace: 'flux-giantswarm',
    });
    expect(source.url).toContain('management-clusters/gazelle/extras');
  });

  it('explains a failed HelmRelease lookup without reporting it', () => {
    const forbidden = new Error('helmreleases is forbidden');
    mockUseResource.mockImplementation(
      (_cluster: string, ResourceClass: unknown) => ({
        resource: undefined,
        isLoading: false,
        error: ResourceClass === HelmRelease ? forbidden : null,
        errors:
          ResourceClass === HelmRelease
            ? [{ type: 'error', cluster: 'gazelle', error: forbidden }]
            : [],
        incompatibilities: [],
        discoveryErrors: [],
        clientOutdatedStates: [],
      }),
    );

    const source = render(makeResource(HELM_LABELS));

    expect(source.inGit).toBe(false);
    expect(source.errorMessage).toBeDefined();
    expect(source.errors).toEqual([]);
  });

  // useResource reports API discovery as loading even for a disabled query.
  it('is not loading while a lookup it never enables is discovering', () => {
    mockUseResource.mockImplementation(() => ({
      resource: undefined,
      isLoading: true,
      error: null,
      errors: [],
      incompatibilities: [],
      discoveryErrors: [],
      clientOutdatedStates: [],
    }));

    const source = render(makeResource({}));

    expect(source.isLoading).toBe(false);
    expect(source.inGit).toBe(false);
  });

  it('names no HelmRelease until the umbrella release has resolved', () => {
    const inner = makeHelmRelease({
      'helm.toolkit.fluxcd.io/name': 'agent-platform',
      'helm.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
    });
    mockUseResource.mockImplementation(
      (_cluster: string, ResourceClass: unknown, options: { name: string }) => {
        const outerPending =
          ResourceClass === HelmRelease && options.name === 'agent-platform';
        return {
          resource:
            ResourceClass === HelmRelease && !outerPending ? inner : undefined,
          isLoading: outerPending,
          error: null,
          errors: [],
          incompatibilities: [],
          discoveryErrors: [],
          clientOutdatedStates: [],
        };
      },
    );

    const source = render(makeResource(HELM_LABELS));

    expect(source.isLoading).toBe(true);
    expect(source.helmRelease).toBeUndefined();
  });

  it('is not in Git when no Kustomization is found up the chain', () => {
    stubChain({ helmRelease: makeHelmRelease() });

    const source = render(makeResource(HELM_LABELS));

    expect(source.inGit).toBe(false);
    expect(source.kustomization).toBeUndefined();
    expect(source.url).toBeUndefined();
    expect(source.changeRequestTerm).toBeUndefined();
  });

  it('returns a failed Kustomization lookup without reporting it', () => {
    stubChain({ kustomizationError: new Error('forbidden') });

    const source = render(makeResource(KUSTOMIZE_LABELS));

    expect(source.inGit).toBe(true);
    expect(source.url).toBeUndefined();
    expect(source.errorMessage).toBeDefined();
    expect(source.errors).toHaveLength(1);
  });
});
