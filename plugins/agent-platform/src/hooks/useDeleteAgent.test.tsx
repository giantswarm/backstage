import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { crds } from '@giantswarm/k8s-types';
import {
  Agent,
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useDeleteAgent } from './useDeleteAgent';

// The reads and the write are mocked; the provenance helpers and the resource
// classes are the real ones, so the label reading and GVK resolution under test
// are the real thing.
const mockUseResource = jest.fn();
const mockUseSelfSubjectAccessReview = jest.fn();
const mockDeleteResource = jest.fn();
const mockFetchResourceList = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
  useSelfSubjectAccessReview: (...args: unknown[]) =>
    mockUseSelfSubjectAccessReview(...args),
  deleteResource: (...args: unknown[]) => mockDeleteResource(...args),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

const CLUSTER = 'gazelle';
const NAMESPACE = 'agentic-platform';

function makeAgent(labels?: Record<string, string>): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: NAMESPACE,
        labels: labels ?? {
          'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
          'helm.toolkit.fluxcd.io/namespace': NAMESPACE,
        },
      },
      spec: { type: 'Declarative', declarative: { modelConfig: 'opus-4-7' } },
    } as crds.kagent.v1alpha2.Agent,
    CLUSTER,
  );
}

function makeHelmRelease({
  name = 'pr-reviewer',
  chartSourceName = 'agent',
  labels,
  suspend,
}: {
  name?: string;
  chartSourceName?: string;
  labels?: Record<string, string>;
  suspend?: boolean;
} = {}): HelmRelease {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name, namespace: NAMESPACE, labels },
      spec: {
        interval: '10m',
        ...(suspend === undefined ? {} : { suspend }),
        chartRef: {
          kind: 'OCIRepository',
          name: chartSourceName,
          namespace: NAMESPACE,
        },
      },
    } as crds.fluxcd.v2.HelmRelease,
    CLUSTER,
  );
}

function makeChartSource(): OCIRepository {
  return new OCIRepository(
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      metadata: { name: 'agent', namespace: NAMESPACE },
      spec: { interval: '30m', url: 'oci://example.test/charts/agent' },
    } as crds.fluxcd.v1.OCIRepository,
    CLUSTER,
  );
}

/**
 * @param helmRelease the agent's owning release, or undefined if it was not read
 * @param allowed the SelfSubjectAccessReview verdict for deleting it
 * @param namespaceReleases every release the fresh sibling list returns
 * @param didReadNamespaceReleases whether that list read succeeds at all
 */
function setup({
  agent = makeAgent(),
  helmRelease = makeHelmRelease(),
  allowed = true,
  namespaceReleases = [makeHelmRelease()],
  didReadNamespaceReleases = true,
  chartSource = makeChartSource(),
}: {
  agent?: Agent;
  /** `null` means the read returned nothing (undefined re-triggers the default). */
  helmRelease?: HelmRelease | null;
  allowed?: boolean;
  namespaceReleases?: HelmRelease[];
  didReadNamespaceReleases?: boolean;
  chartSource?: OCIRepository;
} = {}) {
  mockUseResource.mockImplementation(
    (
      _cluster: string,
      ResourceClass: { kind: string },
      _options: unknown,
      queryOptions?: { enabled?: boolean },
    ) => {
      // A disabled query has no data, exactly as react-query would report it.
      if (queryOptions?.enabled === false) {
        return { resource: undefined, isLoading: false };
      }

      return {
        resource:
          ResourceClass.kind === 'HelmRelease'
            ? (helmRelease ?? undefined)
            : chartSource,
        isLoading: false,
      };
    },
  );

  // The sibling list is fetched fresh at mutation time, so it is a promise here
  // rather than a hook return. A failure means "cannot tell".
  mockFetchResourceList.mockImplementation(async () => {
    if (!didReadNamespaceReleases) {
      const error = new Error('helmreleases is forbidden');
      error.name = 'ForbiddenError';
      throw error;
    }

    return namespaceReleases.map(release => release.jsonData);
  });

  mockUseSelfSubjectAccessReview.mockReturnValue({
    allowed,
    isLoading: false,
  });

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, { proxy: jest.fn() }]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </TestApiProvider>
  );

  return renderHook(() => useDeleteAgent(agent), { wrapper });
}

beforeEach(() => {
  mockUseResource.mockReset();
  mockUseSelfSubjectAccessReview.mockReset();
  mockDeleteResource.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
  mockFetchResourceList.mockReset();
});

describe('useDeleteAgent', () => {
  it('offers the deletion for an agent owned by a HelmRelease we may delete', () => {
    const { result } = setup();

    expect(result.current.isDeletable).toBe(true);
    expect(result.current.isCheckingDeletable).toBe(false);
  });

  it('checks the permission against the owning release, by name', () => {
    setup();

    expect(mockUseSelfSubjectAccessReview).toHaveBeenCalledWith(
      CLUSTER,
      {
        group: 'helm.toolkit.fluxcd.io',
        resource: 'helmreleases',
        namespace: NAMESPACE,
        name: 'pr-reviewer',
        verb: 'delete',
      },
      { enabled: true },
    );
  });

  it('refuses when the access review says no', () => {
    const { result } = setup({ allowed: false });

    expect(result.current.isDeletable).toBe(false);
  });

  it('refuses when the agent carries no Flux Helm labels', () => {
    // Applied directly rather than released, so there is no HelmRelease whose
    // removal would take it away.
    const { result } = setup({ agent: makeAgent({}) });

    expect(result.current.isDeletable).toBe(false);
    expect(result.current.isCheckingDeletable).toBe(false);
  });

  it('refuses when the owning release could not be read', () => {
    // Regression: `isDeletable` used to key on the provenance *label*, so an
    // unreadable release (a proxy 5xx that is not retried, or RBAC granting
    // `delete` without `get`) still offered the action — which then failed, and
    // silently switched off the Kustomization guard, since a release that cannot
    // be read also reads as not-GitOps-owned.
    const { result } = setup({ helmRelease: null });

    expect(result.current.isDeletable).toBe(false);
    expect(result.current.isCheckingDeletable).toBe(false);
  });

  it('refuses when the release is applied by a Kustomization', () => {
    // Its desired state is in Git, so Flux would put it straight back.
    const { result } = setup({
      helmRelease: makeHelmRelease({
        labels: {
          'kustomize.toolkit.fluxcd.io/name': 'agents',
          'kustomize.toolkit.fluxcd.io/namespace': 'flux-system',
        },
      }),
    });

    expect(result.current.isDeletable).toBe(false);
  });

  it('refuses to delete a suspended release rather than claim an uninstall', async () => {
    // Flux drops the finalizer on a suspended release without running the
    // uninstall, so the HelmRelease would go and the Agent would stay — with no
    // owner left, and no way back through this path.
    const { result } = setup({
      helmRelease: makeHelmRelease({ suspend: true }),
    });

    await act(async () => {
      await expect(result.current.deleteAgent()).rejects.toThrow(/suspended/);
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('deletes the release and the chart source when nothing else uses it', async () => {
    const { result } = setup({ namespaceReleases: [makeHelmRelease()] });

    await act(async () => {
      await result.current.deleteAgent();
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(2);
    expect(mockDeleteResource.mock.calls[0][0]).toMatchObject({
      cluster: CLUSTER,
      name: 'pr-reviewer',
      namespace: NAMESPACE,
      gvk: expect.objectContaining({
        plural: 'helmreleases',
        apiVersion: 'v2',
      }),
    });
    expect(mockDeleteResource.mock.calls[1][0]).toMatchObject({
      cluster: CLUSTER,
      name: 'agent',
      namespace: NAMESPACE,
      gvk: expect.objectContaining({
        plural: 'ocirepositories',
        apiVersion: 'v1',
      }),
    });
  });

  it('keeps the chart source when another release still references it', async () => {
    const { result } = setup({
      namespaceReleases: [
        makeHelmRelease(),
        makeHelmRelease({ name: 'triage' }),
      ],
    });

    await act(async () => {
      await result.current.deleteAgent();
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(1);
    expect(mockDeleteResource.mock.calls[0][0]).toMatchObject({
      gvk: expect.objectContaining({ plural: 'helmreleases' }),
    });
  });

  it('ignores releases pointing at a different chart source', async () => {
    const { result } = setup({
      namespaceReleases: [
        makeHelmRelease(),
        makeHelmRelease({ name: 'muster', chartSourceName: 'muster' }),
      ],
    });

    await act(async () => {
      await result.current.deleteAgent();
    });

    // The muster release holds a different OCIRepository, so it does not keep
    // this agent's chart source alive.
    expect(mockDeleteResource).toHaveBeenCalledTimes(2);
    expect(mockDeleteResource.mock.calls[1][0]).toMatchObject({
      name: 'agent',
      gvk: expect.objectContaining({ plural: 'ocirepositories' }),
    });
  });

  it('keeps the chart source when the sibling list could not be read', async () => {
    // An empty list because the read failed is not the same answer as an empty
    // list because nothing references it.
    const { result } = setup({
      namespaceReleases: [],
      didReadNamespaceReleases: false,
    });

    await act(async () => {
      await result.current.deleteAgent();
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(1);
  });

  it('reads the sibling list fresh, scoped to the chart source namespace', async () => {
    // Regression: this used to come from `useResources`, whose cache key omitted
    // the namespace — so another namespace's list could answer the question, and
    // a <=60s cache could miss a sibling created moments ago in another tab. The
    // destructive decision must rest on a request made now, for this namespace.
    const { result } = setup();

    await act(async () => {
      await result.current.deleteAgent();
    });

    expect(mockFetchResourceList).toHaveBeenCalledTimes(1);
    expect(mockFetchResourceList.mock.calls[0][0]).toMatchObject({
      cluster: CLUSTER,
      namespace: NAMESPACE,
      gvk: expect.objectContaining({ plural: 'helmreleases' }),
    });
  });

  it('treats an already-deleted release as success', async () => {
    const notFound = new Error('helmreleases "pr-reviewer" not found');
    notFound.name = 'NotFoundError';
    mockDeleteResource.mockRejectedValueOnce(notFound);

    const { result } = setup();

    await act(async () => {
      await expect(result.current.deleteAgent()).resolves.toBeUndefined();
    });

    expect(result.current.error).toBeNull();
  });

  it('reports a refused deletion', async () => {
    const forbidden = new Error('helmreleases is forbidden');
    forbidden.name = 'ForbiddenError';
    mockDeleteResource.mockRejectedValueOnce(forbidden);

    const { result } = setup();

    await act(async () => {
      await expect(result.current.deleteAgent()).rejects.toThrow(
        'helmreleases is forbidden',
      );
    });

    await waitFor(() => {
      expect(result.current.error?.name).toBe('ForbiddenError');
    });
  });

  it('succeeds even when the chart source cleanup fails', async () => {
    // The agent is gone, which is what was asked for, and a chart source nobody
    // references does nothing on its own.
    mockDeleteResource
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('ocirepositories is forbidden'));

    const { result } = setup();

    await act(async () => {
      await expect(result.current.deleteAgent()).resolves.toBeUndefined();
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('fails with an accurate message when the release is not in hand', async () => {
    // Not "it was applied directly": the agent carries the provenance label, so
    // the release exists — we just could not read it. Pointing the user at
    // deleting it by hand would be wrong.
    const { result } = setup({ helmRelease: null });

    await act(async () => {
      await expect(result.current.deleteAgent()).rejects.toThrow(
        /could not be read/,
      );
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });
});
