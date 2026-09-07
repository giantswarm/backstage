import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { NodePoolDetails } from './NodePoolDetails';

function renderDetails(route: string, onClose: () => void = jest.fn()) {
  return renderInTestApp(
    <NodePoolDetails
      nodePoolName="my-pool"
      nodeCount={6}
      configuration={<div>configuration panel</div>}
      nodes={<div>nodes panel</div>}
      onClose={onClose}
    />,
    { initialRouteEntries: [route] },
  );
}

describe('NodePoolDetails', () => {
  it('opens the Configuration tab when no tab is in the URL', async () => {
    await renderDetails('/?name=my-pool');

    expect(await screen.findByText('configuration panel')).toBeInTheDocument();
    expect(screen.queryByText('nodes panel')).not.toBeInTheDocument();
  });

  it('opens the tab named in the URL', async () => {
    await renderDetails('/?name=my-pool&tab=nodes');

    expect(await screen.findByText('nodes panel')).toBeInTheDocument();
    expect(screen.queryByText('configuration panel')).not.toBeInTheDocument();
  });

  it('falls back to Configuration for an unrecognised tab', async () => {
    await renderDetails('/?name=my-pool&tab=garbage');

    expect(await screen.findByText('configuration panel')).toBeInTheDocument();
  });

  it('shows the node count on the Nodes tab label', async () => {
    await renderDetails('/?name=my-pool');

    expect(
      await screen.findByRole('tab', { name: 'Nodes (6)' }),
    ).toBeInTheDocument();
  });

  it('switches panels when another tab is selected', async () => {
    await renderDetails('/?name=my-pool');

    await userEvent.click(await screen.findByRole('tab', { name: /Nodes/ }));

    await waitFor(() =>
      expect(screen.getByText('nodes panel')).toBeInTheDocument(),
    );
  });

  it('calls onClose from the close control', async () => {
    const onClose = jest.fn();
    await renderDetails('/?name=my-pool', onClose);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Close node pool details' }),
    );

    expect(onClose).toHaveBeenCalled();
  });
});
