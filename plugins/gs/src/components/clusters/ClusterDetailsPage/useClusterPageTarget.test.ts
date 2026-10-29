import { renderHook } from '@testing-library/react';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useClusterPageTarget } from './useClusterPageTarget';

const mockUseAsyncCluster = jest.fn();

jest.mock('./useCurrentCluster', () => ({
  ...jest.requireActual('./useCurrentCluster'),
  useAsyncCluster: () => mockUseAsyncCluster(),
}));

function createCluster(labels?: Record<string, string>) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: {
        name: 'demo1',
        namespace: 'org-acme',
        ...(labels && { labels }),
      },
      spec: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    'inst-1',
  );
}

describe('useClusterPageTarget', () => {
  it('names the HelmRelease that rendered the cluster', () => {
    mockUseAsyncCluster.mockReturnValue({
      installationName: 'inst-1',
      cluster: createCluster({
        'helm.toolkit.fluxcd.io/name': 'demo1',
        'helm.toolkit.fluxcd.io/namespace': 'org-acme',
      }),
    });

    const { result } = renderHook(() => useClusterPageTarget());

    expect(result.current).toMatchObject({
      installationName: 'inst-1',
      name: 'demo1',
      namespace: 'org-acme',
      organization: 'acme',
      helmRelease: { name: 'demo1', namespace: 'org-acme' },
    });
  });

  it('names no HelmRelease for a cluster without helm-controller labels', () => {
    mockUseAsyncCluster.mockReturnValue({
      installationName: 'inst-1',
      cluster: createCluster({
        'kustomize.toolkit.fluxcd.io/name': 'flux',
        'kustomize.toolkit.fluxcd.io/namespace': 'default',
      }),
    });

    const { result } = renderHook(() => useClusterPageTarget());

    expect(result.current?.helmRelease).toBeUndefined();
  });

  it('is undefined while the cluster loads', () => {
    mockUseAsyncCluster.mockReturnValue({ installationName: 'inst-1' });

    const { result } = renderHook(() => useClusterPageTarget());

    expect(result.current).toBeUndefined();
  });
});
