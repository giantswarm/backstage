import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { RECONCILE_REQUESTED_AT_ANNOTATION } from '../../lib/k8s/FluxObject';
import { Kustomization } from '../../lib/k8s/Kustomization';
import { useFluxResourceActions } from './useFluxResourceActions';

const SSAR_PATH = '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews';
const KUSTOMIZATION_PATH =
  '/apis/kustomize.toolkit.fluxcd.io/v1/namespaces/flux-system/kustomizations/my-app';

function createKustomization(
  options: { suspend?: boolean; apiVersion?: string } = {},
): Kustomization {
  const json = {
    apiVersion: options.apiVersion ?? 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: 'my-app',
      namespace: 'flux-system',
    },
    spec: {
      suspend: options.suspend,
    },
    status: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

type ProxyArgs = {
  clusterName: string;
  path: string;
  init?: { method?: string; body?: string };
};

function createMockKubernetesApi({ allowed = true } = {}) {
  return {
    proxy: jest.fn(async ({ path }: ProxyArgs) => {
      if (path === SSAR_PATH) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ status: { allowed } }),
        } as Response;
      }

      return { ok: true, status: 200 } as Response;
    }),
    getObjectsByEntity: jest.fn(),
    getClusters: jest.fn(),
    getCluster: jest.fn(),
    getWorkloadsByEntity: jest.fn(),
    getCustomObjectsByEntity: jest.fn(),
  };
}

function renderActions(
  resource: Kustomization,
  api = createMockKubernetesApi(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[kubernetesApiRef, api]]}>
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );

  const rendered = renderHook(() => useFluxResourceActions(resource), {
    wrapper: Wrapper,
  });

  return { ...rendered, api, queryClient };
}

function findPatchCall(api: ReturnType<typeof createMockKubernetesApi>) {
  const call = api.proxy.mock.calls.find(
    ([args]: [ProxyArgs]) => args.init?.method === 'PATCH',
  );

  return call?.[0] as ProxyArgs | undefined;
}

describe('useFluxResourceActions', () => {
  it('reviews patch access for the kind and namespace, without the name', async () => {
    // Per-namespace+kind granularity: one cached review covers every card of
    // that kind in that namespace.
    const { result, api } = renderActions(createKustomization());

    await waitFor(() => expect(result.current.canPatch).toBe(true));

    const review = api.proxy.mock.calls.find(
      ([args]: [ProxyArgs]) => args.path === SSAR_PATH,
    )?.[0] as ProxyArgs;

    expect(JSON.parse(review.init!.body!)).toEqual({
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          group: 'kustomize.toolkit.fluxcd.io',
          resource: 'kustomizations',
          namespace: 'flux-system',
          verb: 'patch',
        },
      },
    });
  });

  it('reports canPatch false when the review denies access', async () => {
    const { result } = renderActions(
      createKustomization(),
      createMockKubernetesApi({ allowed: false }),
    );

    await waitFor(() =>
      expect(result.current.isCheckingPermission).toBe(false),
    );
    expect(result.current.canPatch).toBe(false);
  });

  it('requests reconciliation by annotating the resource', async () => {
    const before = Date.now();
    const { result, api } = renderActions(createKustomization());

    await result.current.requestReconciliation();

    const patch = findPatchCall(api)!;
    expect(patch.path).toBe(KUSTOMIZATION_PATH);

    const body = JSON.parse(patch.init!.body!);
    const requestedAt =
      body.metadata.annotations[RECONCILE_REQUESTED_AT_ANNOTATION];

    expect(Date.parse(requestedAt)).toBeGreaterThanOrEqual(before);
    expect(requestedAt).toBe(new Date(requestedAt).toISOString());
  });

  it('suspends by patching spec.suspend', async () => {
    const { result, api } = renderActions(createKustomization());

    await result.current.setSuspended(true);

    expect(JSON.parse(findPatchCall(api)!.init!.body!)).toEqual({
      spec: { suspend: true },
    });
  });

  it('resumes by patching spec.suspend to false', async () => {
    const { result, api } = renderActions(
      createKustomization({ suspend: true }),
    );

    await result.current.setSuspended(false);

    expect(JSON.parse(findPatchCall(api)!.init!.body!)).toEqual({
      spec: { suspend: false },
    });
  });

  it('targets the API version the object was read at, not the latest supported one', async () => {
    // Reads resolve their version through discovery, so a write must follow.
    const { result, api } = renderActions(
      createKustomization({
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1beta2',
      }),
    );

    await result.current.setSuspended(true);

    expect(findPatchCall(api)!.path).toBe(
      '/apis/kustomize.toolkit.fluxcd.io/v1beta2/namespaces/flux-system/kustomizations/my-app',
    );
  });

  it('invalidates the list and get reads after a successful patch', async () => {
    const { result, queryClient } = renderActions(createKustomization());
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await result.current.setSuspended(true);

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [
        'cluster',
        'test-installation',
        'list',
        'kustomize.toolkit.fluxcd.io',
        'v1',
        'kustomizations',
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [
        'cluster',
        'test-installation',
        'get',
        'kustomize.toolkit.fluxcd.io',
        'v1',
        'kustomizations',
        'flux-system',
        'my-app',
      ],
    });
  });

  it('surfaces a rejected patch as a ForbiddenError', async () => {
    const api = createMockKubernetesApi();
    api.proxy.mockImplementation(async ({ path }: ProxyArgs) => {
      if (path === SSAR_PATH) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ status: { allowed: true } }),
        } as Response;
      }

      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ message: 'forbidden' }),
      } as Response;
    });

    const { result } = renderActions(createKustomization(), api);

    await expect(result.current.requestReconciliation()).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });
});
