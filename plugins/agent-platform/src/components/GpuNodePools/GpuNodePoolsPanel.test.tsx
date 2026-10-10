import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import type { NodeSizePrices } from '../../hooks/useNodeSizePrices';
import { poolPriceOf } from '../../lib/poolPricing';
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

  describe('the Cost column', () => {
    const row = (name: string, readyReplicas: number) =>
      ({
        id: `inst-1/wc1/${name}`,
        installation: 'inst-1',
        poolName: name,
        cluster: { name: 'wc1', organization: 'org-a', poolReleases: [] },
        pool: {
          name: `wc1-${name}`,
          accelerator: 'nvidia-l4',
          instanceTypes: ['g6.xlarge', 'g6.2xlarge'],
          readyReplicas,
          replicas: readyReplicas,
          version: '1.33.4',
          controlPlaneVersion: '1.33.4',
          ownerRelease: null,
          phase: 'ready',
          steps: [],
        },
      }) as unknown as GpuNodePoolRow;

    const prices = (priced: boolean, reading = false): NodeSizePrices => ({
      priceOf: r =>
        priced
          ? poolPriceOf(r.pool, [
              {
                instanceType: 'g6.xlarge',
                size: 'xlarge',
                vcpu: 4,
                memoryGiB: 16,
                gpus: 1,
                gpuMemoryGiB: 24,
                usableVcpu: 3,
                usableMemoryGiB: 12,
                pricePerHourUSD: 1.0064,
              },
              {
                instanceType: 'g6.2xlarge',
                size: '2xlarge',
                vcpu: 8,
                memoryGiB: 32,
                gpus: 1,
                gpuMemoryGiB: 24,
                usableVcpu: 7,
                usableMemoryGiB: 28,
                pricePerHourUSD: 1.22249,
              },
            ])
          : undefined,
      isReading: () => reading,
      isLoading: reading,
    });

    const renderWith = (p: NodeSizePrices) =>
      renderInTestApp(
        <GpuNodePoolsPanel
          rows={[row('l4', 2)]}
          isLoading={false}
          notes={[]}
          errors={[]}
          onRemove={jest.fn()}
          opened={undefined}
          onToggleLifecycle={jest.fn()}
          onCloseLifecycle={jest.fn()}
          prices={p}
        />,
      );

    it("prices the pool's running nodes at the list price of its sizes", async () => {
      await renderWith(prices(true));

      expect(
        await screen.findByRole('columnheader', { name: 'Cost' }),
      ).toBeInTheDocument();
      expect(screen.getByText('$2.01–2.44/h now')).toBeInTheDocument();
      expect(
        screen.getByText('$1.01–1.22/h per node · 2 running'),
      ).toBeInTheDocument();
    });

    it('says no price is listed rather than inventing one', async () => {
      await renderWith(prices(false));

      expect(
        await screen.findByText('No price listed for its sizes'),
      ).toBeInTheDocument();
    });

    it('holds the cell while the prices are read', async () => {
      await renderWith(prices(false, true));

      expect(await screen.findByText('Reading…')).toBeInTheDocument();
    });
  });
});
