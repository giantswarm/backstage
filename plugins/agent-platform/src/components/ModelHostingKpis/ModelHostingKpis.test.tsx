import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import type { NodeSizePrices } from '../../hooks/useNodeSizePrices';
import { poolPriceOf } from '../../lib/poolPricing';
import { ModelHostingKpis } from './ModelHostingKpis';

let mockServing: Record<string, unknown>;
jest.mock('../ServingProvider', () => ({
  useServing: () => mockServing,
}));
let mockServedRows: { readiness: string }[] = [];
jest.mock('../ServedModelRowsProvider', () => ({
  useServedModelRows: () => ({ rows: mockServedRows }),
}));

let mockAvailable: string[] = [];
let mockPools: { rows: GpuNodePoolRow[]; caches: unknown[] } = {
  rows: [],
  caches: [],
};
jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => ({
    available: mockAvailable,
    isLoading: false,
  }),
  useGpuNodePools: () => ({ ...mockPools, isLoading: false }),
}));

let mockPrices: NodeSizePrices;
jest.mock('../../hooks/useNodeSizePrices', () => ({
  useNodeSizePrices: () => mockPrices,
}));

const pool = (name: string, readyReplicas: number) =>
  ({
    id: `inst-1/wc1/${name}`,
    installation: 'inst-1',
    poolName: name,
    cluster: { name: 'wc1' },
    pool: {
      name,
      accelerator: 'nvidia-l4',
      instanceTypes: ['g6.xlarge'],
      readyReplicas,
    },
  }) as unknown as GpuNodePoolRow;

const PRICED: NodeSizePrices = {
  priceOf: row =>
    poolPriceOf(row.pool, [
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
    ]),
  isReading: () => false,
  isLoading: false,
};

function tile(label: string) {
  const region = screen.getByRole('region', {
    name: 'Model hosting at a glance',
  });
  const labelNode = within(region).getByText(label);
  return labelNode.parentElement as HTMLElement;
}

describe('ModelHostingKpis', () => {
  beforeEach(() => {
    mockServing = {
      isLoading: false,
      reachableInstallations: ['inst-1'],
      gpuNodes: [
        {
          id: 'n1',
          installation: 'inst-1',
          name: 'n1',
          ready: true,
          resource: 'nvidia.com/gpu',
          capacity: 1,
          allocatable: 1,
          requested: 1,
        },
        {
          id: 'n2',
          installation: 'inst-1',
          name: 'n2',
          ready: true,
          resource: 'nvidia.com/gpu',
          capacity: 1,
          allocatable: 1,
        },
      ],
    };
    mockServedRows = [
      { readiness: 'ready' },
      { readiness: 'ready' },
      { readiness: 'starting' },
    ];
    mockAvailable = ['inst-1'];
    mockPools = { rows: [pool('l4', 2)], caches: [] };
    mockPrices = PRICED;
  });

  it('heads the page with running models, GPUs, pools and their cost now', async () => {
    await renderInTestApp(<ModelHostingKpis />);

    expect(within(tile('Models running')).getByText('2')).toBeInTheDocument();
    expect(
      within(tile('Models running')).getByText('1 starting'),
    ).toBeInTheDocument();
    expect(within(tile('GPUs in use')).getByText('1 of 2')).toBeInTheDocument();
    expect(within(tile('GPU pools')).getByText('1')).toBeInTheDocument();
    expect(
      within(tile('GPU pools')).getByText('2 nodes running'),
    ).toBeInTheDocument();
    expect(
      within(tile('GPU cost now')).getByText('$2.01/h'),
    ).toBeInTheDocument();
  });

  it('costs nothing by the hour while every pool is scaled to zero', async () => {
    mockPools = { rows: [pool('l4', 0)], caches: [] };
    await renderInTestApp(<ModelHostingKpis />);

    expect(
      within(tile('GPU cost now')).getByText('$0.00/h'),
    ).toBeInTheDocument();
  });

  it('leaves out a cost no price backs, and the pool tiles without cluster-manager', async () => {
    mockAvailable = [];
    mockPools = { rows: [], caches: [] };
    mockServing = { ...mockServing, gpuNodes: [] };
    await renderInTestApp(<ModelHostingKpis />);

    expect(screen.getByText('Models running')).toBeInTheDocument();
    expect(screen.queryByText('GPUs in use')).toBeNull();
    expect(screen.queryByText('GPU pools')).toBeNull();
    expect(screen.queryByText('GPU cost now')).toBeNull();
    expect(screen.queryByText('Model cache')).toBeNull();
  });

  it('says how many running pools a total leaves out for want of a price', async () => {
    mockPools = { rows: [pool('l4', 2), pool('h100', 1)], caches: [] };
    mockPrices = {
      ...PRICED,
      priceOf: row => (row.poolName === 'l4' ? PRICED.priceOf(row) : undefined),
    };
    await renderInTestApp(<ModelHostingKpis />);

    expect(
      within(tile('GPU cost now')).getByText(
        'list price · 1 pool without a price left out',
      ),
    ).toBeInTheDocument();
  });
});
