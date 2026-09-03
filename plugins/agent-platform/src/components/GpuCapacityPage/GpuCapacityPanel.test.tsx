import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import type { GpuNode } from '../../lib/serving';
import {
  columnsForNodes,
  describeNode,
  formatGpuMemory,
  GpuCapacityPanel,
  lacksInstallationCache,
  NO_CACHE_ON_NODE_HINT,
  NOT_SERVING_TARGET_DESCRIPTION,
} from './GpuCapacityPanel';

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
    expect(
      screen.getByText('of 86.1 GiB · 58.0 GiB reserved'),
    ).toBeInTheDocument();
    // A cluster node has no accelerated flag: no marker either way.
    expect(screen.queryByText('accelerated')).not.toBeInTheDocument();
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

/** The host an Ollama-backed model-manager proxies, as the lab reports it (model-manager 0.7+). */
const ollamaHost: GpuNode = {
  id: 'lab/172.21.0.1',
  installation: 'lab',
  name: '172.21.0.1',
  ready: true,
  memoryAllocatableBytes: 92417933312,
  memoryBudgetBytes: 92417933312,
  memoryBudgetSource: 'host-meminfo',
  memoryBudgetNote:
    'host memory as seen from the model-manager pod; per-model accelerator share in running.vramBytes',
  memoryReservedBytes: 5403658158,
  memoryFreeBytes: 87014275154,
  accelerated: true,
};

const GPU_COLUMNS = [
  'GPU',
  'Memory',
  'GPUs',
  'Allocatable',
  'Requested',
  'Free',
];

describe('GpuCapacityPanel · backend host', () => {
  it('renders the host with budget, reservation, free and the accelerated marker, and no GPU columns', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[ollamaHost]}
        installations={['lab']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText('172.21.0.1')).toBeInTheDocument();
    expect(screen.getByText('Backend host')).toBeInTheDocument();
    expect(screen.getByText('81.0 GiB free')).toBeInTheDocument();
    expect(
      screen.getByText('of 86.1 GiB · 5.0 GiB reserved'),
    ).toBeInTheDocument();
    expect(screen.getByText('81.0 GiB free')).toHaveAttribute(
      'title',
      expect.stringContaining(
        "Budget: the host's memory (MemTotal of /proc/meminfo as the serving layer's pod sees it)",
      ),
    );
    expect(screen.getByText('81.0 GiB free')).toHaveAttribute(
      'title',
      expect.stringContaining('5.0 GiB reserved by the models loaded here'),
    );
    expect(screen.getByText('81.0 GiB free')).toHaveAttribute(
      'title',
      expect.stringContaining('host memory as seen from the model-manager pod'),
    );
    const marker = screen.getByText('accelerated');
    expect(marker).toHaveAttribute(
      'title',
      expect.stringContaining('memory on the accelerator (GPU)'),
    );

    // A fleet of hosts has no GPU product, count or device-plugin figure to
    // show: the columns are gone, and nothing reads "unknown" or "—".
    for (const header of GPU_COLUMNS) {
      expect(
        screen.queryByRole('columnheader', { name: header }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole('columnheader', { name: 'Memory budget' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('unknown')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(
      screen.getByText(/A backend host has no GPU figures/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/gpu-feature-discovery node labels/),
    ).not.toBeInTheDocument();
  });

  it('shows no marker on a host whose loaded models sit in system memory', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[
          {
            ...ollamaHost,
            accelerated: false,
            memoryReservedBytes: 0,
            memoryFreeBytes: 92417933312,
          },
        ]}
        installations={['lab']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.queryByText('accelerated')).not.toBeInTheDocument();
    expect(screen.getByText('86.1 GiB free')).toHaveAttribute(
      'title',
      expect.stringContaining(
        'no loaded model is on the accelerator right now',
      ),
    );
    expect(screen.getByText('of 86.1 GiB · 0 B reserved')).toBeInTheDocument();
  });

  it('puts a fault before the kind of node', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[{ ...ollamaHost, ready: false }]}
        installations={['lab']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(screen.queryByText('Backend host')).not.toBeInTheDocument();
  });

  it('keeps the GPU columns next to a cluster node and says what the host row is instead of "unknown"', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[withPlugin, ollamaHost]}
        installations={['inst-1', 'lab']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    for (const header of GPU_COLUMNS) {
      expect(
        screen.getByRole('columnheader', { name: header }),
      ).toBeInTheDocument();
    }
    // The cluster node renders as before.
    expect(screen.getByText('NVIDIA-GB10')).toBeInTheDocument();
    expect(screen.getByText('120 GiB')).toBeInTheDocument();

    const hostRow = screen.getByText('172.21.0.1').closest('[role="row"]');
    expect(hostRow).not.toBeNull();
    const dashes = within(hostRow as HTMLElement).getAllByText('—');
    expect(dashes).toHaveLength(GPU_COLUMNS.length);
    for (const dash of dashes) {
      expect(dash).toHaveAttribute(
        'title',
        expect.stringContaining(
          "The host a serving backend runs on, not a cluster node: the backend's API does not expose the accelerator",
        ),
      );
    }
    expect(within(hostRow as HTMLElement).queryByText('unknown')).toBeNull();
    expect(within(hostRow as HTMLElement).queryByText('0')).toBeNull();
    expect(
      within(hostRow as HTMLElement).getByText('accelerated'),
    ).toBeInTheDocument();
    // Both sentences of the intro, since both kinds of node are listed.
    expect(
      screen.getByText(/gpu-feature-discovery node labels/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A backend host has no GPU figures/),
    ).toBeInTheDocument();
  });
});

describe('columnsForNodes', () => {
  it('drops the GPU columns only for a fleet of hosts, and keeps them while nothing is listed yet', () => {
    expect(columnsForNodes([])).toEqual({
      gpu: true,
      budget: false,
      cache: false,
    });
    expect(columnsForNodes([ollamaHost])).toEqual({
      gpu: false,
      budget: true,
      cache: false,
    });
    expect(columnsForNodes([withPlugin, ollamaHost])).toEqual({
      gpu: true,
      budget: true,
      cache: false,
    });
    expect(columnsForNodes([labelsOnly])).toEqual({
      gpu: true,
      budget: false,
      cache: false,
    });
  });
});

describe('GpuCapacityPanel · operator-set host budget', () => {
  it('explains a budget the operator set and keeps the host rendering', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[
          {
            ...ollamaHost,
            memoryBudgetBytes: 34359738368,
            memoryBudgetSource: 'override',
            memoryBudgetNote:
              "memory budget set by the operator (ollama.memoryBudgetGiB / --ollama-memory-budget-gib), not the host's MemTotal; per-model accelerator share in running.vramBytes",
            memoryFreeBytes: 28956080210,
          },
        ]}
        installations={['lab']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText('27.0 GiB free')).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Budget: set by the operator (ollama.memoryBudgetGiB',
      ),
    );
    expect(screen.getByText('27.0 GiB free')).toHaveAttribute(
      'title',
      expect.stringContaining('memory budget set by the operator'),
    );
    expect(
      screen.getByText('of 32.0 GiB · 5.0 GiB reserved'),
    ).toBeInTheDocument();
    // Still the backend's host: the operator corrected its figure, the row
    // does not turn into a cluster node with empty GPU columns.
    expect(screen.getByText('Backend host')).toBeInTheDocument();
    for (const header of GPU_COLUMNS) {
      expect(
        screen.queryByRole('columnheader', { name: header }),
      ).not.toBeInTheDocument();
    }
  });
});

/** spidertron's two GPU nodes as a kserve model-manager (0.11 on) reports them. */
const sparkTarget: GpuNode = {
  id: 'gpu/spark-8723',
  installation: 'gpu',
  name: 'spark-8723',
  ready: true,
  product: 'NVIDIA-GB10-SHARED',
  memoryMiB: 122880,
  labeledCount: 3,
  memoryBudgetBytes: 130_531_688_448,
  memoryBudgetSource: 'gpu-labels',
  memoryReservedBytes: 0,
  memoryFreeBytes: 130_531_688_448,
  cache: { claim: 'hf-cache', mountPath: '/mnt/models', models: 20 },
  eligible: true,
};

/** The second Spark: GPUs, but the cache claim is a local volume on the first. */
const sparkPinnedOut: GpuNode = {
  ...sparkTarget,
  id: 'gpu/spark-e119',
  name: 'spark-e119',
  cache: undefined,
  eligible: false,
  eligibilityReason: 'cache claim hf-cache is pinned to spark-8723',
};

const rowOf = (name: string) =>
  screen.getByText(name).closest('[role="row"]') as HTMLElement;

describe('GpuCapacityPanel · serving targets', () => {
  it('marks a node the serving layer will not place a model on, with its reason on hover', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[sparkTarget, sparkPinnedOut]}
        installations={['gpu']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    const marker = screen.getByText(NOT_SERVING_TARGET_DESCRIPTION);
    expect(rowOf('spark-e119')).toContainElement(marker);
    expect(marker).toHaveAttribute(
      'title',
      'Not a serving target: cache claim hf-cache is pinned to spark-8723',
    );
    // The reason sits in the budget tooltip too, next to the budget's source.
    const budget = within(rowOf('spark-e119')).getByText('122 GiB free');
    expect(budget).toHaveAttribute(
      'title',
      expect.stringContaining('Budget: the GPU memory from the node labels'),
    );
    expect(budget).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Not a serving target: cache claim hf-cache is pinned to spark-8723',
      ),
    );
    // The target reads as before: no marker, no hint in its cache cell.
    expect(
      within(rowOf('spark-8723')).queryByText(NOT_SERVING_TARGET_DESCRIPTION),
    ).toBeNull();
    expect(screen.getByText('20 models')).toBeInTheDocument();
    expect(screen.queryByText(NO_CACHE_ON_NODE_HINT)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /A node marked not a serving target is one the serving layer will not place a model on/,
      ),
    ).toBeInTheDocument();
  });

  it('says why in words when the serving layer gives no reason', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[{ ...sparkPinnedOut, eligibilityReason: undefined }]}
        installations={['gpu']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText(NOT_SERVING_TARGET_DESCRIPTION)).toHaveAttribute(
      'title',
      'Not a serving target: the serving layer gave no reason',
    );
  });

  it('hints at the missing cache on an unjudged node beside the node that holds it', async () => {
    // An older model-manager (before 0.11) gives no verdict: the softer hint.
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[
          { ...sparkTarget, eligible: undefined },
          {
            ...sparkPinnedOut,
            eligible: undefined,
            eligibilityReason: undefined,
          },
        ]}
        installations={['gpu']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(
      screen.queryByText(NOT_SERVING_TARGET_DESCRIPTION),
    ).not.toBeInTheDocument();
    const hint = screen.getByText(NO_CACHE_ON_NODE_HINT);
    expect(rowOf('spark-e119')).toContainElement(hint);
    expect(hint).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Another node of this installation holds the model cache',
      ),
    );
    expect(
      screen.queryByText(/A node marked not a serving target/),
    ).not.toBeInTheDocument();
  });

  it('gives no hint where the cache is shared, the node is judged, or the cache is on another installation', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[
          {
            ...sparkTarget,
            eligible: undefined,
            cache: { ...sparkTarget.cache, shared: true },
          },
          {
            ...sparkPinnedOut,
            eligible: undefined,
            eligibilityReason: undefined,
          },
          {
            ...sparkPinnedOut,
            id: 'other/spark-e119',
            installation: 'other',
            eligible: undefined,
            eligibilityReason: undefined,
          },
          {
            ...sparkPinnedOut,
            id: 'gpu/judged',
            name: 'judged',
            eligible: true,
          },
        ]}
        installations={['gpu', 'other']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.queryByText(NO_CACHE_ON_NODE_HINT)).not.toBeInTheDocument();
  });

  it('names the resource in the GPU column where the labels give no product', async () => {
    await renderInTestApp(
      <GpuCapacityPanel
        nodes={[
          {
            id: 'inst-1/amd-node',
            installation: 'inst-1',
            name: 'amd-node',
            ready: true,
            resource: 'amd.com/gpu',
            capacity: 2,
            allocatable: 2,
            requested: 0,
          },
        ]}
        installations={['inst-1']}
        unavailable={{}}
        isLoading={false}
      />,
    );

    expect(screen.getByText('amd.com/gpu')).toBeInTheDocument();
  });
});

describe('describeNode / lacksInstallationCache', () => {
  it('puts a fault first, then the verdict, then the kind of node', () => {
    expect(describeNode({ ...sparkPinnedOut, ready: false })).toBe('Not ready');
    expect(describeNode(sparkPinnedOut)).toBe(NOT_SERVING_TARGET_DESCRIPTION);
    expect(describeNode(sparkTarget)).toBeUndefined();
    expect(describeNode(ollamaHost)).toBe('Backend host');
    expect(describeNode({ ...ollamaHost, eligible: false })).toBe(
      NOT_SERVING_TARGET_DESCRIPTION,
    );
  });

  it('hints only for an unjudged, cache-less cluster node beside a node-local cache of its installation', () => {
    const unjudged = {
      ...sparkPinnedOut,
      eligible: undefined,
      eligibilityReason: undefined,
    };
    const holder = { ...sparkTarget, eligible: undefined };

    expect(lacksInstallationCache(unjudged, [holder, unjudged])).toBe(true);
    expect(lacksInstallationCache(unjudged, [unjudged])).toBe(false);
    expect(
      lacksInstallationCache(unjudged, [
        { ...holder, cache: { ...holder.cache, shared: true } },
        unjudged,
      ]),
    ).toBe(false);
    expect(
      lacksInstallationCache(unjudged, [
        { ...holder, installation: 'other' },
        unjudged,
      ]),
    ).toBe(false);
    expect(lacksInstallationCache(sparkPinnedOut, [holder])).toBe(false);
    expect(
      lacksInstallationCache({ ...unjudged, eligible: true }, [holder]),
    ).toBe(false);
    expect(lacksInstallationCache(ollamaHost, [holder])).toBe(false);
  });
});
