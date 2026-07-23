import { createEvent, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceNode } from './ResourceNode';

function createKustomization(name = 'my-app'): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name,
      namespace: 'flux-system',
    },
    status: {
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          reason: 'ReconciliationSucceeded',
          message: 'Applied revision',
          lastTransitionTime: '2026-01-01T00:00:00Z',
        },
      ],
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

describe('ResourceNode', () => {
  it('renders the resource name and kind', async () => {
    await renderInTestApp(
      <ResourceNode
        cluster="test-installation"
        name="my-app"
        namespace="flux-system"
        kind="Kustomization"
        resource={createKustomization()}
        expandable={false}
        expanded={false}
        onExpand={() => {}}
      />,
    );

    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('Kustomization')).toBeInTheDocument();
  });

  it('does not render an expand button when the node is not expandable', async () => {
    await renderInTestApp(
      <ResourceNode
        cluster="test-installation"
        name="my-app"
        kind="Kustomization"
        resource={createKustomization()}
        expandable={false}
        expanded={false}
        onExpand={() => {}}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /expand|collapse/i }),
    ).not.toBeInTheDocument();
  });

  it('renders an expand button that calls onExpand when clicked', async () => {
    const user = userEvent.setup();
    const onExpand = jest.fn();

    await renderInTestApp(
      <ResourceNode
        cluster="test-installation"
        name="my-app"
        kind="Kustomization"
        resource={createKustomization()}
        expandable
        expanded={false}
        onExpand={onExpand}
      />,
    );

    const button = screen.getByRole('button', { name: 'Expand' });
    await user.click(button);

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('prevents the default click action so the wrapping tree anchor does not navigate', async () => {
    await renderInTestApp(
      <ResourceNode
        cluster="test-installation"
        name="my-app"
        kind="Kustomization"
        resource={createKustomization()}
        expandable
        expanded={false}
        onExpand={() => {}}
      />,
    );

    // The tree row is rendered inside an anchor React Router resolves to a real
    // href; an un-prevented click triggers a full-page navigation. The expand
    // control is wrapped in a capture-phase handler that must cancel the default
    // action. Dispatch on that wrapper directly — react-aria treats a lone click
    // on its button differently than a real browser click, so we assert the
    // wrapper's own handler cancels the default.
    const wrapper = screen.getByRole('button', { name: 'Expand' })
      .parentElement as HTMLElement;
    const clickEvent = createEvent.click(wrapper);
    fireEvent(wrapper, clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('labels the expand button as "Collapse" when expanded', async () => {
    await renderInTestApp(
      <ResourceNode
        cluster="test-installation"
        name="my-app"
        kind="Kustomization"
        resource={createKustomization()}
        expandable
        expanded
        onExpand={() => {}}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Collapse' }),
    ).toBeInTheDocument();
  });
});
