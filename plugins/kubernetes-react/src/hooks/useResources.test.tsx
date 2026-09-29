import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../lib/k8s/App';
import { ControlPlane } from '../lib/k8s/capi/ControlPlane';
import { useResources } from './useResources';

function createWrapper(proxy: jest.Mock) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, { proxy } as any]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('useResources', () => {
  it('makes no request at all, discovery included, when disabled', async () => {
    const proxy = jest.fn();

    const { result } = renderHook(
      () => useResources(['cluster-a'], App, {}, { enabled: false }),
      { wrapper: createWrapper(proxy) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(proxy).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([]);
  });

  it('keeps showing what it listed while it is disabled for a moment', async () => {
    // The cluster serves KubeadmControlPlane only at v1beta1, while the static
    // version is v1beta2. Disabling must not drop the discovered version: the
    // list query would move to the v1beta2 key and its items would vanish.
    const group = ControlPlane.group;
    const proxy = jest.fn(async ({ path }: { path: string }) => {
      if (path === `/apis/${group}`) {
        return ok({
          name: group,
          versions: [{ groupVersion: `${group}/v1beta1`, version: 'v1beta1' }],
          preferredVersion: {
            groupVersion: `${group}/v1beta1`,
            version: 'v1beta1',
          },
        });
      }
      if (path === `/apis/${group}/v1beta1`) {
        return ok({
          groupVersion: `${group}/v1beta1`,
          resources: [{ name: ControlPlane.plural }],
        });
      }
      if (path.startsWith(`/apis/${group}/v1beta1/${ControlPlane.plural}`)) {
        return ok({
          items: [
            {
              apiVersion: `${group}/v1beta1`,
              kind: ControlPlane.kind,
              metadata: { name: 'my-cluster', namespace: 'org-test' },
            },
          ],
        });
      }
      return { ok: false, status: 404, statusText: '' } as Response;
    });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useResources(['cluster-a'], ControlPlane, {}, { enabled }),
      { wrapper: createWrapper(proxy), initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    const requests = proxy.mock.calls.length;

    rerender({ enabled: false });

    expect(result.current.resources).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
    expect(proxy).toHaveBeenCalledTimes(requests);
  });
});
