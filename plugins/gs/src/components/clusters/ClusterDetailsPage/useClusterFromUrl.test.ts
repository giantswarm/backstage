import { renderHook } from '@testing-library/react';
import {
  App,
  Cluster,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useClusterFromUrl } from './useClusterFromUrl';

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

const metadata = { name: 'my-cluster', namespace: 'org-test' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cluster = new Cluster({ metadata } as any, 'installation-a');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app = new App({ metadata } as any, 'installation-a');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const release = new HelmRelease({ metadata } as any, 'installation-a');

describe('useClusterFromUrl', () => {
  beforeEach(() => {
    results.clear();
    enabledFor.clear();
  });

  it('reads an App-based cluster without reading a HelmRelease', () => {
    results.set(App, { resource: app });
    results.set(Cluster, { resource: cluster });

    const { result } = renderHook(() => useClusterFromUrl());

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

    const { result } = renderHook(() => useClusterFromUrl());

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

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.loading).toBe(true);
  });

  it("reports the App's 404 when neither an App nor a HelmRelease exists", () => {
    const appNotFound = notFound('App');
    results.set(App, { error: appNotFound });
    results.set(HelmRelease, { error: notFound('HelmRelease') });
    results.set(Cluster, { resource: cluster });

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.error).toBe(appNotFound);
  });

  it("reports the HelmRelease's error when it is not a 404", () => {
    const releaseForbidden = forbidden();
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { error: releaseForbidden });
    results.set(Cluster, { resource: cluster });

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.error).toBe(releaseForbidden);
  });

  it('does not read a HelmRelease when the App read fails otherwise', () => {
    const appForbidden = forbidden();
    results.set(App, { error: appForbidden });
    results.set(Cluster, { resource: cluster });

    const { result } = renderHook(() => useClusterFromUrl());

    expect(enabledFor.get(HelmRelease)).toBe(false);
    expect(result.current.error).toBe(appForbidden);
  });

  it('shows the HelmRelease while its Cluster does not exist yet', () => {
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { resource: release });
    results.set(Cluster, { error: notFound('Cluster') });

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.notFound).toBe(false);
    expect(result.current.clusterRelease).toBe(release);
    expect(result.current.error?.name).toBe('NotFoundError');
  });

  it('is not found when no object of the cluster exists', () => {
    results.set(App, { error: notFound('App') });
    results.set(HelmRelease, { error: notFound('HelmRelease') });
    results.set(Cluster, { error: notFound('Cluster') });

    const { result } = renderHook(() => useClusterFromUrl());

    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
