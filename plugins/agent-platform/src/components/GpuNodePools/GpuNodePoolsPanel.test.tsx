import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { GpuNodePoolsPanel } from './GpuNodePoolsPanel';

const renderPanel = (isLoading: boolean) =>
  renderInTestApp(
    <GpuNodePoolsPanel
      rows={[]}
      isLoading={isLoading}
      notes={[]}
      errors={[]}
      onRemove={jest.fn()}
      opened={undefined}
      onToggleLifecycle={jest.fn()}
      onCloseLifecycle={jest.fn()}
    />,
  );

describe('GpuNodePoolsPanel', () => {
  it('shows a loading indicator, not an empty table, while the pools are read', async () => {
    await renderPanel(true);

    expect(
      await screen.findByRole('progressbar', { name: 'Reading node pools…' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No GPU node pools yet.'),
    ).not.toBeInTheDocument();
  });

  it('says there are no pools, without an empty table', async () => {
    await renderPanel(false);

    expect(screen.getByText('No GPU node pools yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
