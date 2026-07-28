import { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ConfigMap,
  ImagePolicy,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { FluxResourceActions } from './FluxResourceActions';

const SSAR_PATH = '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews';

function createKustomization(
  options: {
    suspend?: boolean;
    requestedAt?: string;
    lastHandledReconcileAt?: string;
  } = {},
): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: 'my-app',
      namespace: 'flux-system',
      annotations: options.requestedAt
        ? { 'reconcile.fluxcd.io/requestedAt': options.requestedAt }
        : undefined,
    },
    spec: { suspend: options.suspend },
    status: { lastHandledReconcileAt: options.lastHandledReconcileAt },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

function createImagePolicy(options: { suspend?: boolean } = {}): ImagePolicy {
  const json = {
    apiVersion: 'image.toolkit.fluxcd.io/v1beta2',
    kind: 'ImagePolicy',
    metadata: { name: 'my-policy', namespace: 'flux-system' },
    spec: { suspend: options.suspend },
    status: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImagePolicy(json as any, 'test-installation');
}

/** A non-Flux resource, to exercise the kind guard. */
function createConfigMap(): ConfigMap {
  const json = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'my-config', namespace: 'flux-system' },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ConfigMap(json as any, 'test-installation');
}

type ProxyArgs = { clusterName: string; path: string; init?: RequestInit };

function createMockKubernetesApi({
  allowed = true,
  patchStatus = 200,
}: { allowed?: boolean; patchStatus?: number } = {}) {
  return {
    proxy: jest.fn(async ({ path }: ProxyArgs) => {
      if (path === SSAR_PATH) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ status: { allowed } }),
        } as Response;
      }

      return {
        ok: patchStatus < 400,
        status: patchStatus,
        statusText: patchStatus === 403 ? 'Forbidden' : 'OK',
        json: async () => ({ message: 'forbidden' }),
      } as Response;
    }),
    getObjectsByEntity: jest.fn(),
    getClusters: jest.fn(),
    getCluster: jest.fn(),
    getWorkloadsByEntity: jest.fn(),
    getCustomObjectsByEntity: jest.fn(),
  };
}

function createAlertApi() {
  return { post: jest.fn(), alert$: jest.fn() };
}

async function renderActions(
  resource: Kustomization | ImagePolicy | ConfigMap,
  {
    kubernetesApi = createMockKubernetesApi(),
    alertApi = createAlertApi(),
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubernetesApi],
          [alertApiRef, alertApi],
        ]}
      >
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );

  await renderInTestApp(
    <Providers>
      <FluxResourceActions resource={resource} />
    </Providers>,
  );

  return { kubernetesApi, alertApi };
}

function findPatchBody(
  kubernetesApi: ReturnType<typeof createMockKubernetesApi>,
) {
  const call = kubernetesApi.proxy.mock.calls.find(
    ([args]: [ProxyArgs]) => args.init?.method === 'PATCH',
  );

  return JSON.parse(call![0].init!.body as string);
}

describe('FluxResourceActions', () => {
  it('shows Reconcile and Suspend when the user may patch', async () => {
    await renderActions(createKustomization());

    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resume' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when the access review denies the patch', async () => {
    const { kubernetesApi } = await renderActions(createKustomization(), {
      kubernetesApi: createMockKubernetesApi({ allowed: false }),
    });

    await waitFor(() => expect(kubernetesApi.proxy).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: 'Reconcile' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Suspend' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing while the access review is still in flight', async () => {
    // A never-resolving proxy keeps the review pending, so a read-only user
    // never sees buttons flash in and disappear.
    const kubernetesApi = createMockKubernetesApi();
    kubernetesApi.proxy.mockImplementation(() => new Promise(() => {}));

    await renderActions(createKustomization(), { kubernetesApi });

    expect(
      screen.queryByRole('button', { name: 'Reconcile' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing for a resource that is not a Flux object', async () => {
    const { kubernetesApi } = await renderActions(createConfigMap());

    expect(
      screen.queryByRole('button', { name: 'Reconcile' }),
    ).not.toBeInTheDocument();
    // No access review either — the kind is filtered out before the hook mounts.
    expect(kubernetesApi.proxy).not.toHaveBeenCalled();
  });

  it('offers both actions for an ImagePolicy', async () => {
    // image-reflector-controller honours the reconcile-request annotation and
    // `spec.suspend` for ImagePolicy; only the `flux` CLI lacks a subcommand.
    const { kubernetesApi } = await renderActions(createImagePolicy());

    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();

    const review = kubernetesApi.proxy.mock.calls.find(
      ([args]: [ProxyArgs]) => args.path === SSAR_PATH,
    )?.[0] as ProxyArgs;

    expect(
      JSON.parse(review.init!.body as string).spec.resourceAttributes,
    ).toEqual({
      group: 'image.toolkit.fluxcd.io',
      resource: 'imagepolicies',
      namespace: 'flux-system',
      verb: 'patch',
    });
  });

  it('suspends an ImagePolicy', async () => {
    const { kubernetesApi } = await renderActions(createImagePolicy());

    await userEvent.click(
      await screen.findByRole('button', { name: 'Suspend' }),
    );

    await waitFor(() =>
      expect(findPatchBody(kubernetesApi)).toEqual({ spec: { suspend: true } }),
    );
    expect(
      kubernetesApi.proxy.mock.calls.find(
        ([args]: [ProxyArgs]) => args.init?.method === 'PATCH',
      )![0].path,
    ).toBe(
      '/apis/image.toolkit.fluxcd.io/v1beta2/namespaces/flux-system/imagepolicies/my-policy',
    );
  });

  it('offers Resume for a suspended ImagePolicy', async () => {
    await renderActions(createImagePolicy({ suspend: true }));

    expect(
      await screen.findByRole('button', { name: 'Resume' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconcile' })).toBeDisabled();
  });

  it('offers Resume and disables Reconcile for a suspended resource', async () => {
    await renderActions(createKustomization({ suspend: true }));

    expect(
      await screen.findByRole('button', { name: 'Resume' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Suspend' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconcile' })).toBeDisabled();
  });

  it('disables Reconcile while a requested reconciliation is unhandled', async () => {
    await renderActions(
      createKustomization({
        requestedAt: '2026-07-28T10:00:00.000Z',
        lastHandledReconcileAt: '2026-07-28T09:00:00.000Z',
      }),
    );

    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeDisabled();
    // Suspending is still allowed while a request is outstanding.
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled();
  });

  it('re-enables Reconcile once the controller has handled the request', async () => {
    const handled = '2026-07-28T10:00:00.000Z';

    await renderActions(
      createKustomization({
        requestedAt: handled,
        lastHandledReconcileAt: handled,
      }),
    );

    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeEnabled();
  });

  it('keeps Reconcile enabled for a resource that was never reconciled on demand', async () => {
    // No annotation at all: nothing is pending, so the absence of
    // `lastHandledReconcileAt` must not read as an outstanding request.
    await renderActions(createKustomization());

    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeEnabled();
  });

  it('requests reconciliation and reports success', async () => {
    const { kubernetesApi, alertApi } = await renderActions(
      createKustomization(),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Reconcile' }),
    );

    await waitFor(() =>
      // Array path: the annotation key contains dots, which the string form of
      // `toHaveProperty` would read as a nested path.
      expect(findPatchBody(kubernetesApi).metadata.annotations).toHaveProperty([
        'reconcile.fluxcd.io/requestedAt',
      ]),
    );
    expect(alertApi.post).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        message:
          'Reconciliation requested for Kustomization flux-system/my-app.',
      }),
    );
  });

  it('suspends and reports success', async () => {
    const { kubernetesApi, alertApi } = await renderActions(
      createKustomization(),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Suspend' }),
    );

    await waitFor(() =>
      expect(findPatchBody(kubernetesApi)).toEqual({ spec: { suspend: true } }),
    );
    expect(alertApi.post).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        message: 'Suspended Kustomization flux-system/my-app.',
      }),
    );
  });

  it('resumes a suspended resource', async () => {
    const { kubernetesApi, alertApi } = await renderActions(
      createKustomization({ suspend: true }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Resume' }),
    );

    await waitFor(() =>
      expect(findPatchBody(kubernetesApi)).toEqual({
        spec: { suspend: false },
      }),
    );
    expect(alertApi.post).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        message: 'Resumed Kustomization flux-system/my-app.',
      }),
    );
  });

  it('reports a rejected patch as a permission error', async () => {
    // The access review is advisory, so a 403 can still come back from the
    // apiserver — the user must be told rather than left guessing.
    const { alertApi } = await renderActions(createKustomization(), {
      kubernetesApi: createMockKubernetesApi({ patchStatus: 403 }),
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Suspend' }),
    );

    await waitFor(() =>
      expect(alertApi.post).toHaveBeenCalledWith({
        severity: 'error',
        message:
          'You are not allowed to suspend Kustomization flux-system/my-app on cluster test-installation.',
      }),
    );
  });
});
