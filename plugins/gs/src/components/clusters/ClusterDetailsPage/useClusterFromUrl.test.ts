import { createElement, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Query, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  App,
  Cluster,
  HelmRelease,
  KubeObjectInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { clusterRefetchInterval, useClusterFromUrl } from './useClusterFromUrl';

type Result = {
  resource?: unknown;
  isLoading?: boolean;
  error?: Error | null;
};

const results = new Map<unknown, Result>();
const enabledFor = new Map<unknown, boolean>();

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRefParams: () => ({
    installationName: 'installation-a',
    namespace: 'org-test',
    name: 'my-cluster',
  }),
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => {
  const actual = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...actual,
    useResource: (
      _installation: string,
      ResourceClass: unknown,
      _options: unknown,
      queryOptions?: { enabled?: boolean },
    ) => {
      const enabled = queryOptions?.enabled ?? true;
      enabledFor.set(ResourceClass, enabled);
      const result = enabled ? (results.get(ResourceClass) ?? {}) : {};
      return {
        resource: result.resource,
        isLoading: result.isLoading ?? false,
        error: result.error ?? null,
      };
    },
  };
});

const notFound = (kind: string) =>
  Object.assign(new Error(`${kind} "my-cluster" not found`), {
    name: 'NotFoundError',
  });

const forbidden = () =>
  Object.assign(new Error('forbidden'), { name: 'ForbiddenError' });

const unavailable = () =>
  Object.assign(new Error('service unavailable'), { name: 'Error' });

const metadata = { name: 'my-cluster', namespace: 'org-test' };
const deletingMetadata = {
  ...metadata,
  deletionTimestamp: '2026-10-06T10:56:25Z',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cluster = new Cluster({ metadata } as any, 'installation-a');
const deletingCluster = new Cluster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { metadata: deletingMetadata } as any,
  'installation-a',
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app = new App({ metadata } as any, 'installation-a');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const release = new HelmRelease({ metadata } as any, 'installation-a');

function renderClusterFromUrl(queryClient = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useClusterFromUrl(), { wrapper });
}

describe('useClusterFromUrl', () => {
  beforeEach(() => {
    results.clear();
    enabledFor.clear();
  });

  it('reads an App-based cluster without reading a HelmRelease', () => {
    results.set(App, { resource: app });
    results.set(Cluster, { resource: cluster });

    const { result } = renderClusterFromUrl();

    expect(enabledFor.get(HelmRelease)).toBe(false);
    expect(result.current).toMatchObject({
      cluster,
      clusterApp: app,
      clusterRelease: undefined,
      notFound: false,
      error: null,
    });
  });

  it('opens a cluster a HelmRelease installs, without an error', () => {
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { resource: release });
    results.set(Cluster, { resource: cluster });

    const { result } = renderClusterFromUrl();

    expect(result.current).toMatchObject({
      cluster,
      clusterApp: undefined,
      clusterRelease: release,
      notFound: false,
      error: null,
    });
  });

  it('is loading while the HelmRelease is read', () => {
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { isLoading: true });
    results.set(Cluster, { resource: cluster });

    const { result } = renderClusterFromUrl();

    expect(result.current.loading).toBe(true);
  });

  it("reports the App's 404 when neither an App nor a HelmRelease exists", () => {
    const appNotFound = notFound('App');
    results.set(App, { error: appNotFound });
    results.set(HelmRelease, { error: notFound('HelmRelease') });
    results.set(Cluster, { resource: cluster });

    const { result } = renderClusterFromUrl();

    expect(result.current.error).toBe(appNotFound);
  });

  it("reports the HelmRelease's error when it is not a 404", () => {
    const releaseForbidden = forbidden();
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { error: releaseForbidden });
    results.set(Cluster, { resource: cluster });

    const { result } = renderClusterFromUrl();

    expect(result.current.error).toBe(releaseForbidden);
  });

  it('does not read a HelmRelease when the App read fails otherwise', () => {
    const appForbidden = forbidden();
    results.set(App, { error: appForbidden });
    results.set(Cluster, { resource: cluster });

    const { result } = renderClusterFromUrl();

    expect(enabledFor.get(HelmRelease)).toBe(false);
    expect(result.current.error).toBe(appForbidden);
  });

  it('shows the HelmRelease while its Cluster does not exist yet', () => {
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { resource: release });
    results.set(Cluster, { error: notFound('Cluster') });

    const { result } = renderClusterFromUrl();

    expect(result.current.notFound).toBe(false);
    expect(result.current.clusterRelease).toBe(release);
    expect(result.current.error?.name).toBe('NotFoundError');
  });

  it('is not found when no object of the cluster exists', () => {
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { error: notFound('HelmRelease') });
    results.set(Cluster, { error: notFound('Cluster') });

    const { result } = renderClusterFromUrl();

    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
  });

  describe('a cluster being deleted', () => {
    it('opens without an error once its App and HelmRelease are gone', () => {
      results.set(App, { error: notFound('App') });
      results.set(HelmRelease, { error: notFound('HelmRelease') });
      results.set(Cluster, { resource: deletingCluster });

      const { result } = renderClusterFromUrl();

      expect(result.current).toMatchObject({
        cluster: deletingCluster,
        isDeleting: true,
        notFound: false,
        error: null,
      });
    });

    it('drops an App read earlier that a re-read no longer finds', () => {
      results.set(App, { resource: app, error: notFound('App') });
      results.set(HelmRelease, { error: notFound('HelmRelease') });
      results.set(Cluster, { resource: deletingCluster });

      const { result } = renderClusterFromUrl();

      expect(result.current.clusterApp).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it('keeps showing the cluster while the HelmRelease is first read after its App went', () => {
      results.set(App, { resource: app, error: notFound('App') });
      results.set(HelmRelease, { isLoading: true });
      results.set(Cluster, { resource: deletingCluster });

      const { result } = renderClusterFromUrl();

      expect(result.current.loading).toBe(false);
    });

    it('is not found once a re-read no longer finds the cluster, its App read earlier included', () => {
      results.set(App, { resource: app, error: notFound('App') });
      results.set(HelmRelease, { error: notFound('HelmRelease') });
      results.set(Cluster, {
        resource: deletingCluster,
        error: notFound('Cluster'),
      });

      const { result } = renderClusterFromUrl();

      expect(result.current).toMatchObject({
        cluster: undefined,
        clusterApp: undefined,
        isDeleting: false,
        notFound: true,
        error: null,
      });
    });

    it('keeps the cluster on the page when a re-read fails otherwise, and says why', () => {
      const failure = unavailable();
      results.set(App, { resource: app });
      results.set(Cluster, { resource: deletingCluster, error: failure });

      const { result } = renderClusterFromUrl();

      expect(result.current).toMatchObject({
        cluster: deletingCluster,
        isDeleting: true,
        error: null,
        refreshError: failure,
      });
    });

    it('keeps the cluster on the page when the HelmRelease read after its App went fails, and says why', () => {
      const releaseForbidden = forbidden();
      results.set(App, { resource: app, error: notFound('App') });
      results.set(HelmRelease, { error: releaseForbidden });
      results.set(Cluster, { resource: deletingCluster });

      const { result } = renderClusterFromUrl();

      expect(result.current).toMatchObject({
        cluster: deletingCluster,
        isDeleting: true,
        error: null,
        refreshError: releaseForbidden,
      });
    });

    it("re-reads the installation's resources every 10 seconds, until the cluster and its installer are gone", () => {
      jest.useFakeTimers();
      try {
        const queryClient = new QueryClient();
        const invalidate = jest
          .spyOn(queryClient, 'invalidateQueries')
          .mockResolvedValue();
        results.set(App, { resource: app });
        results.set(Cluster, { resource: deletingCluster });

        const { rerender } = renderClusterFromUrl(queryClient);
        act(() => jest.advanceTimersByTime(10_000));

        expect(invalidate).toHaveBeenCalledTimes(1);
        const { predicate } = invalidate.mock.calls[0][0]!;
        const matches = (queryKey: string[]) =>
          predicate!({ queryKey } as unknown as Query);
        expect(
          matches(['cluster', 'installation-a', 'get', 'cluster.x-k8s.io']),
        ).toBe(true);
        expect(
          matches(['cluster', 'installation-a', 'list', 'cluster.x-k8s.io']),
        ).toBe(true);
        expect(
          matches(['cluster', 'installation-a', 'api-discovery', 'x']),
        ).toBe(false);
        expect(
          matches(['cluster', 'installation-b', 'get', 'cluster.x-k8s.io']),
        ).toBe(false);

        expect(invalidate.mock.calls[0][1]).toEqual({ cancelRefetch: false });

        results.set(Cluster, {
          resource: deletingCluster,
          error: notFound('Cluster'),
        });
        rerender();
        act(() => jest.advanceTimersByTime(10_000));

        expect(invalidate).toHaveBeenCalledTimes(2);

        results.set(App, { resource: app, error: notFound('App') });
        results.set(HelmRelease, { error: notFound('HelmRelease') });
        rerender();
        act(() => jest.advanceTimersByTime(30_000));

        expect(invalidate).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('does not re-read the rest of the page of a live cluster', () => {
    jest.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      results.set(App, { resource: app });
      results.set(Cluster, { resource: cluster });

      const { result } = renderClusterFromUrl(queryClient);
      act(() => jest.advanceTimersByTime(60_000));

      expect(result.current.isDeleting).toBe(false);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('clusterRefetchInterval', () => {
  const query = (state: { data?: unknown; error?: Error | null }) =>
    ({ state: { error: null, ...state } }) as Query<KubeObjectInterface>;

  it('re-reads a live cluster every minute, a failed re-read included', () => {
    expect(clusterRefetchInterval(query({ data: { metadata } }))).toBe(60_000);
    expect(
      clusterRefetchInterval(
        query({ data: { metadata }, error: unavailable() }),
      ),
    ).toBe(60_000);
  });

  it('leaves a cluster being deleted to the page-wide re-read', () => {
    expect(
      clusterRefetchInterval(query({ data: { metadata: deletingMetadata } })),
    ).toBe(false);
  });

  it('stops once the cluster is gone, and before it was ever read', () => {
    expect(
      clusterRefetchInterval(
        query({ data: { metadata }, error: notFound('Cluster') }),
      ),
    ).toBe(false);
    expect(clusterRefetchInterval(query({}))).toBe(false);
  });
});
