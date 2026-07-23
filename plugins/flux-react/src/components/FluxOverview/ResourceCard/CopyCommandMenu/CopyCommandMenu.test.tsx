import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { CopyCommandMenu } from './CopyCommandMenu';

function createKustomization(
  options: { suspend?: boolean } = {},
): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
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

describe('CopyCommandMenu', () => {
  const writeText = jest.fn(() => Promise.resolve());

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, {
      clipboard: { writeText },
    });
  });

  it('opens the menu and shows reconcile/suspend for a running resource', async () => {
    await renderInTestApp(<CopyCommandMenu resource={createKustomization()} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy CLI command' }),
    );

    expect(
      await screen.findByRole('menuitem', { name: 'kubectl get -o yaml' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'flux reconcile' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'flux suspend' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'flux resume' }),
    ).not.toBeInTheDocument();
  });

  it('shows flux resume for a suspended resource', async () => {
    await renderInTestApp(
      <CopyCommandMenu resource={createKustomization({ suspend: true })} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy CLI command' }),
    );

    expect(
      await screen.findByRole('menuitem', { name: 'flux resume' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'flux reconcile' }),
    ).not.toBeInTheDocument();
  });

  it('copies the selected command to the clipboard', async () => {
    await renderInTestApp(<CopyCommandMenu resource={createKustomization()} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Copy CLI command' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'kubectl describe' }),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'kubectl describe kustomizations.kustomize.toolkit.fluxcd.io my-app -n flux-system',
      ),
    );
  });
});
