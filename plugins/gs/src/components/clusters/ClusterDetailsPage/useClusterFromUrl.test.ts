import { renderHook } from '@testing-library/react';
import {
  App,
  Cluster,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useClusterFromUrl } from './useClusterFromUrl';

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRefParams: () => ({
    installationName: 'installation-a',
    namespace: 'org-test',
    name: 'my-cluster',
  }),
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: jest.fn(),
}));

const mockUseResource = useResource as jest.Mock;

function createCluster(deletionTimestamp?: string) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: {
        name: 'my-cluster',
        namespace: 'org-test',
        ...(deletionTimestamp && { deletionTimestamp }),
      },
      spec: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    'installation-a',
  );
}

function notFound() {
  const error = new Error('not found');
  error.name = 'NotFoundError';
  return error;
}

function mockResources(cluster: Cluster | undefined, appError: Error | null) {
  mockUseResource.mockImplementation(
    (_installation: string, kind: typeof App | typeof Cluster) =>
      kind === Cluster
        ? { resource: cluster, isLoading: false, error: null }
        : { resource: undefined, isLoading: false, error: appError },
  );
}

describe('useClusterFromUrl', () => {
  it('loads a cluster being deleted whose App is gone', () => {
    const cluster = createCluster('2026-09-30T10:00:00Z');
    mockResources(cluster, notFound());

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.cluster).toBe(cluster);
    expect(result.current.clusterApp).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.notFound).toBe(false);
  });

  it('reports a missing App for a cluster that is not being deleted', () => {
    mockResources(createCluster(), notFound());

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.error?.name).toBe('NotFoundError');
  });
});
