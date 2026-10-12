import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import type { NodeSizePrices } from '../../hooks/useNodeSizePrices';
import { poolPriceOf } from '../../lib/poolPricing';
import { poolPhaseLabel } from '../../lib/poolLifecycle';
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

  describe('notes and errors per environment', () => {
    const renderNotes = (
      notes: { installation: string; note: string }[],
      errors: { installation: string; error: Error }[] = [],
    ) =>
      renderInTestApp(
        <GpuNodePoolsPanel
          rows={[]}
          isLoading={false}
          notes={notes}
          errors={errors}
          onRemove={jest.fn()}
          opened={undefined}
          onToggleLifecycle={jest.fn()}
          onCloseLifecycle={jest.fn()}
        />,
      );
    const names = (count: number) =>
      Array.from({ length: count }, (_, index) => `inst-${index + 1}`);

    it('names three environments in full, sharing a note, with no disclosure', async () => {
      await renderNotes(
        names(3).map(installation => ({
          installation,
          note: 'no Cluster API',
        })),
        [{ installation: 'inst-9', error: new Error('boom') }],
      );

      expect(
        screen.getByText('inst-1, inst-2, inst-3: no Cluster API'),
      ).toBeInTheDocument();
      expect(screen.getByText('inst-9: boom')).toBeInTheDocument();
      expect(screen.queryByText(/more/)).toBeNull();
      expect(screen.queryByRole('button', { name: /environments/ })).toBeNull();
    });

    it('caps 300 environments per note and error, the full lists behind disclosures', async () => {
      await renderNotes(
        names(300).map(installation => ({
          installation,
          note: 'no Cluster API',
        })),
        names(300).map(installation => ({
          installation,
          error: new Error('boom'),
        })),
      );

      expect(
        screen.getByText(
          'inst-1, inst-2, inst-3, inst-4, inst-5 and 295 more: no Cluster API',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'inst-1, inst-2, inst-3, inst-4, inst-5 and 295 more: boom',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'All 300 environments' }),
      ).toHaveLength(2);
    });
  });
});

// T22 B14: nine columns clipped Remove pool and the lifecycle chevron.
describe('GpuNodePoolsPanel at phone width', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const POOL = {
    id: 'inst-1/wc1/l4',
    installation: 'inst-1',
    poolName: 'l4',
    cluster: { name: 'wc1', organization: 'org-a', poolReleases: [] },
    pool: {
      name: 'wc1-l4',
      accelerator: 'nvidia-l4',
      instanceTypes: ['g6.xlarge', 'g6.2xlarge'],
      readyReplicas: 2,
      replicas: 2,
      version: '1.33.4',
      controlPlaneVersion: '1.33.5',
      ownerRelease: null,
      phase: 'ready',
      steps: [],
    },
  } as unknown as GpuNodePoolRow;

  const renderPools = (
    handlers: {
      onRemove?: jest.Mock;
      onToggleLifecycle?: jest.Mock;
    } = {},
    hideColumns?: ReadonlyArray<'installation'>,
  ) =>
    renderInTestApp(
      <GpuNodePoolsPanel
        rows={[POOL]}
        isLoading={false}
        notes={[]}
        errors={[]}
        onRemove={handlers.onRemove ?? jest.fn()}
        opened={undefined}
        onToggleLifecycle={handlers.onToggleLifecycle ?? jest.fn()}
        onCloseLifecycle={jest.fn()}
        hideColumns={hideColumns}
      />,
    );

  it('lists each pool as a stacked row, Remove pool in its menu and the chevron beside it', async () => {
    layout = mockPhoneLayout();
    const onRemove = jest.fn();
    const onToggleLifecycle = jest.fn();
    const user = userEvent.setup();
    await renderPools({ onRemove, onToggleLifecycle });

    expect(screen.queryByRole('grid')).toBeNull();
    const item = within(
      screen.getByRole('list', { name: 'GPU node pools' }),
    ).getByRole('listitem');
    expect(within(item).getByText('wc1-l4')).toBeVisible();
    expect(
      within(item).getByText(poolPhaseLabel(POOL.pool, POOL.cluster)),
    ).toBeVisible();
    for (const fact of ['nvidia-l4', 'wc1', 'inst-1']) {
      expect(within(item).getByText(fact)).toBeVisible();
    }
    expect(
      within(item).getByText('Node sizes: g6.xlarge, g6.2xlarge'),
    ).toBeVisible();
    expect(
      within(item).getByText('Kubernetes 1.33.4 · control plane 1.33.5'),
    ).toBeVisible();
    // No bare destructive button on the row.
    expect(
      within(item).queryByRole('button', { name: 'Remove pool wc1-l4' }),
    ).toBeNull();

    await user.click(
      within(item).getByRole('button', {
        name: 'Show lifecycle of pool wc1-l4',
      }),
    );
    expect(onToggleLifecycle).toHaveBeenCalledWith(POOL);

    await user.click(
      within(item).getByRole('button', { name: 'Actions for pool wc1-l4' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Remove pool…' }),
    );
    expect(onRemove).toHaveBeenCalledWith(POOL);
  });

  it('leaves the environment out where the page drops its column', async () => {
    layout = mockPhoneLayout();
    await renderPools({}, ['installation']);

    expect(screen.getByText('wc1-l4')).toBeVisible();
    expect(screen.queryByText('inst-1')).toBeNull();
  });

  it('keeps the table, with its Remove pool button, on a desktop', async () => {
    layout = mockDesktopLayout();
    await renderPools();

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove pool wc1-l4' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'GPU node pools' })).toBeNull();
  });

  it('shows 300 pools a page at a time (list scale)', async () => {
    layout = mockDesktopLayout();
    const rows = Array.from({ length: 300 }, (_, i) => ({
      ...POOL,
      id: `inst-1/wc1/l4-${i}`,
      poolName: `l4-${i}`,
      pool: { ...POOL.pool, name: `wc1-l4-${String(i).padStart(3, '0')}` },
    })) as GpuNodePoolRow[];
    await renderInTestApp(
      <GpuNodePoolsPanel
        rows={rows}
        isLoading={false}
        notes={[]}
        errors={[]}
        onRemove={jest.fn()}
        opened={undefined}
        onToggleLifecycle={jest.fn()}
        onCloseLifecycle={jest.fn()}
      />,
    );

    // A header row plus the first page.
    expect(screen.getAllByRole('row')).toHaveLength(21);
    expect(screen.getByText('20 pools shown, 280 more')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more pools' }),
    );
    expect(screen.getAllByRole('row')).toHaveLength(41);
  });
});
