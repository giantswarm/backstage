import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
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

describe('ResourceCard', () => {
  it('renders the resource name, kind and status', async () => {
    await renderInTestApp(
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
    await renderInTestApp(
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
    await renderInTestApp(
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

  it('collapses the panel when the trigger is clicked', async () => {
    const user = userEvent.setup();

    await renderInTestApp(
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
