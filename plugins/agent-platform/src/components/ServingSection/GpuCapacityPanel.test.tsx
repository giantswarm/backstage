import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import type { GpuNode } from '../../lib/serving';
import { formatGpuMemory, GpuCapacityPanel } from './GpuCapacityPanel';

const withPlugin: GpuNode = {
  id: 'inst-1/gpu-node-1',
  installation: 'inst-1',
  name: 'gpu-node-1',
  ready: true,
  product: 'NVIDIA-GB10',
  memoryMiB: 122880,
  labeledCount: 1,
  capacity: 1,
  allocatable: 1,
  requested: 1,
};

const labelsOnly: GpuNode = {
  id: 'inst-2/lab-node',
  installation: 'inst-2',
  name: 'lab-node',
  ready: true,
  product: 'NVIDIA-GB10',
  memoryMiB: 122880,
  labeledCount: 1,
};

const noPodData: GpuNode = {
  id: 'inst-1/gpu-node-2',
  installation: 'inst-1',
  name: 'gpu-node-2',
  ready: false,
  capacity: 2,
  allocatable: 2,
};

describe('GpuCapacityPanel', () => {
  it('renders per-node product, memory and counts', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[withPlugin]}
        installations={['inst-1']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText('GPU capacity')).toBeInTheDocument();
    expect(screen.getByText('gpu-node-1')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA-GB10')).toBeInTheDocument();
    expect(screen.getByText('120 GiB')).toBeInTheDocument();
    // total 1, allocatable 1, requested 1, free 0
    expect(screen.getAllByText('1')).toHaveLength(3);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('says allocatable, requested and free are unknown without a device plugin', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[labelsOnly]}
        installations={['inst-2']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    // The GPU count still comes from the discovery label.
    expect(screen.getByText('1')).toBeInTheDocument();
    const unknowns = screen.getAllByText('unknown');
    expect(unknowns).toHaveLength(3);
    expect(unknowns[0]).toHaveAttribute(
      'title',
      expect.stringContaining('no device plugin is running'),
    );
  });

  it('says requested and free are unknown when the pods could not be read', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[noPodData]}
        installations={['inst-1']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Not ready')).toBeInTheDocument();
    const unknowns = screen.getAllByText('unknown');
    expect(unknowns).toHaveLength(2);
    expect(unknowns[0]).toHaveAttribute(
      'title',
      expect.stringContaining('could not be read'),
    );
  });

  it('reports installations whose nodes could not be read', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[]}
        installations={['inst-1', 'inst-2']}
        unavailable={{ 'inst-2': 'forbidden' }}
        isLoading={false}
      />,
    );

    expect(
      screen.getByText('GPU capacity is unavailable for some installations'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /inst-2: you do not have permission to list nodes there/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No GPU nodes found on inst-1.'),
    ).toBeInTheDocument();
  });

  it('shows the empty state when no reachable installation has GPU nodes', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[]}
        installations={['inst-1']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(
      screen.getByText('No GPU nodes found on inst-1.'),
    ).toBeInTheDocument();
  });
});

describe('formatGpuMemory', () => {
  it('renders MiB as GiB, trimming whole numbers', () => {
    expect(formatGpuMemory(122880)).toBe('120 GiB');
    expect(formatGpuMemory(81920)).toBe('80 GiB');
    expect(formatGpuMemory(24576)).toBe('24 GiB');
    expect(formatGpuMemory(23034)).toBe('22.5 GiB');
    expect(formatGpuMemory(undefined)).toBe('—');
  });

  it('adds the memory budget and the model cache when a serving backend reports them', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[
          {
            ...withPlugin,
            memoryBudgetBytes: 92417933312,
            memoryBudgetSource: 'allocatable',
            memoryReservedBytes: 62277025792,
            memoryFreeBytes: 30140907520,
            cache: {
              claim: 'hf-cache',
              mountPath: '/mnt/models',
              models: 3,
              bytesUsed: 77540453864,
              error: 'scan pod timed out',
            },
          },
        ]}
        installations={['inst-1']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Memory budget' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Model cache' }),
    ).toBeInTheDocument();
    expect(screen.getByText('28.1 GiB free')).toBeInTheDocument();
    expect(screen.getByText('of 86.1 GiB')).toBeInTheDocument();
    expect(screen.getByText('3 models · 72.2 GiB')).toBeInTheDocument();
    expect(screen.getByText('scan failed')).toBeInTheDocument();
    expect(
      screen.getByText(/what the serving layer fit-checks/),
    ).toBeInTheDocument();
  });

  it('shows neither column when no node reports them', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[withPlugin]}
        installations={['inst-1']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(
      screen.queryByRole('columnheader', { name: 'Memory budget' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Model cache' }),
    ).not.toBeInTheDocument();
  });
});
