import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useDeleteDeployment } from './useDeleteDeployment';

const deleteResource = jest.fn();
let accessReview = { allowed: true, isLoading: false };
let ociRepository: OCIRepository | undefined;
let resourceCallOptions: { enabled?: boolean } | undefined;

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  deleteResource: (...args: unknown[]) => deleteResource(...args),
  useResource: (
    _installation: string,
    _kind: unknown,
    _ref: unknown,
    options: { enabled?: boolean },
  ) => {
    resourceCallOptions = options;
    return {
      resource: options.enabled ? ociRepository : undefined,
      isLoading: false,
    };
  },
  useSelfSubjectAccessReview: () => accessReview,
}));

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: () => ({}),
}));

const INSTALLATION = 'gazelle';

function createHelmRelease(options: {
  labels?: Record<string, string>;
  chartRef?: { kind: string; name: string; namespace: string };
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: 'my-app',
      namespace: 'org-giantswarm',
      labels: options.labels,
    },
    spec: { chartRef: options.chartRef },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, INSTALLATION);
}

function createOCIRepository(): OCIRepository {
  const json = {
    apiVersion: 'source.toolkit.fluxcd.io/v1',
    kind: 'OCIRepository',
    metadata: { name: 'my-app', namespace: 'org-giantswarm' },
    spec: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new OCIRepository(json as any, INSTALLATION);
}

const OWN_CHART_REF = {
  kind: 'OCIRepository',
  name: 'my-app',
  namespace: 'org-giantswarm',
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function render(deployment: HelmRelease | undefined) {
  return renderHook(() => useDeleteDeployment(deployment, INSTALLATION), {
    wrapper,
  });
}

beforeEach(() => {
  deleteResource.mockReset().mockResolvedValue(undefined);
  accessReview = { allowed: true, isLoading: false };
  ociRepository = undefined;
  resourceCallOptions = undefined;
});

describe('useDeleteDeployment', () => {
  describe('whether the deletion is offered', () => {
    it('offers it for an unowned deployment the user may delete', () => {
      const { result } = render(createHelmRelease({}));

      expect(result.current.isDeletable).toBe(true);
      expect(result.current.owner).toBeUndefined();
    });

    it('withholds it and names the tool that owns the deployment', () => {
      const { result } = render(
        createHelmRelease({
          labels: { 'kustomize.toolkit.fluxcd.io/name': 'customer-apps' },
        }),
      );

      expect(result.current.isDeletable).toBe(false);
      expect(result.current.owner).toBe('Flux');
    });

    it('withholds it when the cluster denies the user', () => {
      accessReview = { allowed: false, isLoading: false };

      const { result } = render(createHelmRelease({}));

      expect(result.current.isDeletable).toBe(false);
    });

    it('reports that the checks are still running', () => {
      accessReview = { allowed: false, isLoading: true };

      const { result } = render(createHelmRelease({}));

      expect(result.current.isCheckingDeletable).toBe(true);
    });

    it('withholds it while the deployment is still loading', () => {
      const { result } = render(undefined);

      expect(result.current.isDeletable).toBe(false);
      expect(result.current.isCheckingDeletable).toBe(false);
    });
  });

  describe('which chart sources are read', () => {
    it('reads the chart source a deployment owns', () => {
      ociRepository = createOCIRepository();

      const { result } = render(createHelmRelease({ chartRef: OWN_CHART_REF }));

      expect(resourceCallOptions?.enabled).toBe(true);
      expect(result.current.deletesChartSource).toBe(true);
    });

    it('leaves a chart source under another name alone', () => {
      ociRepository = createOCIRepository();

      const { result } = render(
        createHelmRelease({
          chartRef: {
            kind: 'OCIRepository',
            name: 'shared-source',
            namespace: 'org-giantswarm',
          },
        }),
      );

      expect(resourceCallOptions?.enabled).toBe(false);
      expect(result.current.deletesChartSource).toBe(false);
    });

    it('leaves a chart source of another kind alone', () => {
      ociRepository = createOCIRepository();

      const { result } = render(
        createHelmRelease({
          chartRef: {
            kind: 'HelmRepository',
            name: 'my-app',
            namespace: 'org-giantswarm',
          },
        }),
      );

      expect(resourceCallOptions?.enabled).toBe(false);
      expect(result.current.deletesChartSource).toBe(false);
    });
  });

  describe('deleting', () => {
    it('deletes the release, and the chart source it owns', async () => {
      ociRepository = createOCIRepository();
      const { result } = render(createHelmRelease({ chartRef: OWN_CHART_REF }));

      await result.current.deleteDeployment();

      expect(deleteResource).toHaveBeenCalledTimes(2);
      expect(deleteResource.mock.calls[0][0]).toMatchObject({
        cluster: INSTALLATION,
        name: 'my-app',
        namespace: 'org-giantswarm',
        gvk: expect.objectContaining({ plural: 'helmreleases' }),
      });
      expect(deleteResource.mock.calls[1][0]).toMatchObject({
        gvk: expect.objectContaining({ plural: 'ocirepositories' }),
      });
    });

    it('deletes only the release when the chart source is shared', async () => {
      const { result } = render(
        createHelmRelease({
          chartRef: {
            kind: 'OCIRepository',
            name: 'shared-source',
            namespace: 'org-giantswarm',
          },
        }),
      );

      await result.current.deleteDeployment();

      expect(deleteResource).toHaveBeenCalledTimes(1);
    });

    it('treats an already deleted release as success', async () => {
      const notFound = new Error('not found');
      notFound.name = 'NotFoundError';
      deleteResource.mockRejectedValueOnce(notFound);

      const { result } = render(createHelmRelease({}));

      await expect(result.current.deleteDeployment()).resolves.toBeUndefined();
    });

    it('surfaces any other failure on the release', async () => {
      const forbidden = new Error('forbidden');
      forbidden.name = 'ForbiddenError';
      deleteResource.mockRejectedValueOnce(forbidden);

      const { result } = render(createHelmRelease({}));

      await expect(result.current.deleteDeployment()).rejects.toThrow(
        'forbidden',
      );
      await waitFor(() => expect(result.current.error).toBe(forbidden));
    });

    it('keeps the chart source when only its deletion fails', async () => {
      ociRepository = createOCIRepository();
      deleteResource
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('still referenced'));

      const { result } = render(createHelmRelease({ chartRef: OWN_CHART_REF }));

      await expect(result.current.deleteDeployment()).resolves.toBeUndefined();
    });

    it('refuses when the deployment could not be read', async () => {
      const { result } = render(undefined);

      await expect(result.current.deleteDeployment()).rejects.toThrow(
        /cannot be deleted from here/,
      );
      expect(deleteResource).not.toHaveBeenCalled();
    });
  });
});
