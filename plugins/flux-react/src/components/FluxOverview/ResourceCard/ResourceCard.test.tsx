import { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceCard } from './ResourceCard';

function createKustomization(
  options: {
    name?: string;
    readyStatus?: 'True' | 'False' | 'Unknown';
    suspend?: boolean;
  } = {},
): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: options.name ?? 'my-app',
      namespace: 'flux-system',
    },
    spec: {
      suspend: options.suspend,
    },
    status: {
      conditions: options.readyStatus
        ? [
            {
              type: 'Ready',
              status: options.readyStatus,
              reason: 'ReconciliationSucceeded',
              message: 'Applied revision',
              lastTransitionTime: '2026-01-01T00:00:00Z',
            },
          ]
        : undefined,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

/**
 * The footer's `FluxResourceActions` runs a `SelfSubjectAccessReview` through
 * react-query, so the card needs a QueryClient and a Kubernetes API — in the app
 * the flux plugin supplies the client.
 */
function createMockKubernetesApi({ allowed = true } = {}) {
  return {
    proxy: jest.fn(
      async () =>
        ({
          ok: true,
          status: 201,
          json: async () => ({ status: { allowed } }),
        }) as unknown as Response,
    ),
    getObjectsByEntity: jest.fn(),
    getClusters: jest.fn(),
    getCluster: jest.fn(),
    getWorkloadsByEntity: jest.fn(),
    getCustomObjectsByEntity: jest.fn(),
  };
}

async function renderCard(children: ReactNode, { allowed = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <TestApiProvider
        apis={[[kubernetesApiRef, createMockKubernetesApi({ allowed })]]}
      >
        {children}
      </TestApiProvider>
    </QueryClientProvider>,
  );
}

describe('ResourceCard', () => {
  it('renders the resource name, kind and status', async () => {
    await renderCard(
      <ResourceCard
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization({ readyStatus: 'True' })}
      />,
    );

    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('Kustomization')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows a not-ready status for a failing resource', async () => {
    await renderCard(
      <ResourceCard
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization({ readyStatus: 'False' })}
      />,
    );

    expect(screen.getByText('Not ready')).toBeInTheDocument();
  });

  it('renders the action row with the copy-command menu when a resource is present', async () => {
    await renderCard(
      <ResourceCard
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization({ readyStatus: 'True' })}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Copy CLI command' }),
    ).toBeInTheDocument();
  });

  it('adds the Flux action buttons to the footer for a user who may patch', async () => {
    await renderCard(
      <ResourceCard
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization({ readyStatus: 'True' })}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Reconcile' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();
  });

  it('omits the Flux action buttons for a read-only user', async () => {
    await renderCard(
      <ResourceCard
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization({ readyStatus: 'True' })}
      />,
      { allowed: false },
    );

    // The copy menu is unaffected — only the write affordances are gated.
    expect(
      await screen.findByRole('button', { name: 'Copy CLI command' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reconcile' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Suspend' }),
    ).not.toBeInTheDocument();
  });

  it('collapses the panel when the trigger is clicked', async () => {
    const user = userEvent.setup();

    await renderCard(
      <ResourceCard
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization({ readyStatus: 'True' })}
      />,
    );

    // Expanded by default: the action row is visible.
    expect(
      screen.getByRole('button', { name: 'Copy CLI command' }),
    ).toBeInTheDocument();

    // The trigger carries the resource name/kind row.
    const trigger = screen.getByRole('button', { name: /my-app/ });
    await user.click(trigger);

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Copy CLI command' }),
      ).not.toBeInTheDocument();
    });
  });
});
