import { renderHook } from '@testing-library/react';
import {
  App,
  Cluster,
  KubeObjectInterface,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Query } from '@tanstack/react-query';
import { clusterRefetchInterval, useClusterFromUrl } from './useClusterFromUrl';

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

function mockResources(
  cluster: Cluster | undefined,
  appError: Error | null,
  clusterError: Error | null = null,
) {
  mockUseResource.mockImplementation(
    (_installation: string, kind: typeof App | typeof Cluster) =>
      kind === Cluster
        ? { resource: cluster, isLoading: false, error: clusterError }
        : { resource: undefined, isLoading: false, error: appError },
  );
}

function queryState(
  status: 'success' | 'error',
  deletionTimestamp?: string,
): Query<KubeObjectInterface> {
  return {
    state: {
      status,
      data: { metadata: { name: 'my-cluster', deletionTimestamp } },
    },
  } as Query<KubeObjectInterface>;
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
    expect(result.current.isDeleting).toBe(true);
  });

  it('reads a cluster that is gone as not found, though its last read is cached', () => {
    mockResources(
      createCluster('2026-09-30T10:00:00Z'),
      notFound(),
      notFound(),
    );

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.cluster).toBeUndefined();
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('reports a missing App for a cluster that is not being deleted', () => {
    mockResources(createCluster(), notFound());

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.error?.name).toBe('NotFoundError');
    expect(result.current.isDeleting).toBe(false);
  });
});

describe('clusterRefetchInterval', () => {
  it('re-reads a cluster being deleted', () => {
    expect(
      clusterRefetchInterval(queryState('success', '2026-09-30T10:00:00Z')),
    ).toBe(10_000);
  });

  it('does not re-read a cluster that is not being deleted', () => {
    expect(clusterRefetchInterval(queryState('success'))).toBe(false);
  });

  it('stops once a read fails, though the deleting cluster is still cached', () => {
    expect(
      clusterRefetchInterval(queryState('error', '2026-09-30T10:00:00Z')),
    ).toBe(false);
  });
});
