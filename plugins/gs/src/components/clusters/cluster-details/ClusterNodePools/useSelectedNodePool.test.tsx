import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useLocation } from 'react-router-dom';
import { useSelectedNodePool } from './useSelectedNodePool';

function Probe() {
  const location = useLocation();
  const {
    selectedNodePool,
    selectedTab,
    setSelectedNodePool,
    setSelectedTab,
    clearSelectedNodePool,
  } = useSelectedNodePool();

  return (
    <div>
      <span data-testid="search">{location.search}</span>
      <span data-testid="pool">{selectedNodePool ?? 'none'}</span>
      <span data-testid="tab">{selectedTab}</span>
      <button onClick={() => setSelectedNodePool('other-pool')}>select</button>
      <button onClick={() => setSelectedTab('nodes')}>to nodes</button>
      <button onClick={() => setSelectedTab('configuration')}>to config</button>
      <button onClick={clearSelectedNodePool}>clear</button>
    </div>
  );
}

async function render(route: string) {
  await renderInTestApp(<Probe />, { initialRouteEntries: [route] });
}

describe('useSelectedNodePool', () => {
  it('defaults to the configuration tab when no tab is set', async () => {
    await render('/?name=my-pool');

    expect(await screen.findByTestId('tab')).toHaveTextContent('configuration');
  });

  it('collapses an unrecognised tab to the default', async () => {
    await render('/?name=my-pool&tab=garbage');

    expect(await screen.findByTestId('tab')).toHaveTextContent('configuration');
  });

  it('keeps the default tab out of the URL', async () => {
    await render('/?name=my-pool&tab=nodes');

    await userEvent.click(await screen.findByText('to config'));

    expect(screen.getByTestId('search')).toHaveTextContent('name=my-pool');
    expect(screen.getByTestId('search')).not.toHaveTextContent('tab=');
  });

  it('writes a non-default tab to the URL', async () => {
    await render('/?name=my-pool');

    await userEvent.click(await screen.findByText('to nodes'));

    expect(screen.getByTestId('search')).toHaveTextContent('tab=nodes');
  });

  it('keeps the current tab when another pool is selected', async () => {
    await render('/?name=my-pool&tab=nodes');

    await userEvent.click(await screen.findByText('select'));

    expect(screen.getByTestId('pool')).toHaveTextContent('other-pool');
    expect(screen.getByTestId('tab')).toHaveTextContent('nodes');
  });

  it('clears both params when the details section is closed', async () => {
    await render('/?name=my-pool&tab=nodes');

    await userEvent.click(await screen.findByText('clear'));

    expect(screen.getByTestId('search')).not.toHaveTextContent('name=');
    expect(screen.getByTestId('search')).not.toHaveTextContent('tab=');
    expect(screen.getByTestId('pool')).toHaveTextContent('none');
  });
});
