import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import type { ServingContextValue } from '../ServingProvider';
import { KSERVE_CR_CAPABILITIES } from '../ServingProvider/useKServeServingSource';
import { GpuCapacityPage } from './GpuCapacityPage';

const mockUseServing = jest.fn<Partial<ServingContextValue>, []>();
jest.mock('../ServingProvider', () => ({
  useServing: () => mockUseServing(),
}));

const kserveServing: Partial<ServingContextValue> = {
  isLoading: false,
  installations: ['inst-1'],
  backends: { 'inst-1': 'kserve' },
  capabilities: { 'inst-1': KSERVE_CR_CAPABILITIES },
  unreachableInstallations: [],
  servedModels: [],
  gpuNodes: [
    {
      id: 'inst-1/gpu-node-1',
      installation: 'inst-1',
      name: 'gpu-node-1',
      ready: true,
      product: 'NVIDIA-GB10',
      memoryMiB: 122880,
      labeledCount: 1,
    },
  ],
  gpuCapacityUnavailable: {},
};

describe('GpuCapacityPage', () => {
  beforeEach(() => {
    mockUseServing.mockReset();
    mockUseServing.mockReturnValue(kserveServing);
  });

  it('lists the GPU nodes of the installations that report a node inventory', async () => {
    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('GPU capacity')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA-GB10')).toBeInTheDocument();
    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
  });

  it('explains the empty state on a fleet without a serving layer', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: [],
      backends: {},
      capabilities: {},
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('No GPU inventory')).toBeInTheDocument();
    expect(
      screen.getByText(/No reachable installation has a serving layer/),
    ).toBeInTheDocument();
  });

  it('explains the empty state when the serving layers report no nodes (Ollama)', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: ['inst-2'],
      backends: { 'inst-2': 'ollama' },
      capabilities: {
        'inst-2': { ...KSERVE_CR_CAPABILITIES, nodeInventory: false },
      },
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('No GPU inventory')).toBeInTheDocument();
    expect(screen.getByText(/do not report their nodes/)).toBeInTheDocument();
  });

  it('holds the empty state back while the serving layer is still being discovered', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      isLoading: true,
      installations: [],
      backends: {},
      capabilities: {},
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
  });

  it('renders the host an Ollama-backed model-manager reports as a node (model-manager 0.7+)', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: ['lab'],
      backends: { lab: 'ollama' },
      capabilities: {
        lab: { ...KSERVE_CR_CAPABILITIES, presets: false, nodeInventory: true },
      },
      gpuNodes: [
        {
          id: 'lab/172.21.0.1',
          installation: 'lab',
          name: '172.21.0.1',
          ready: true,
          memoryBudgetBytes: 92417933312,
          memoryBudgetSource: 'host-meminfo',
          memoryReservedBytes: 5403658158,
          memoryFreeBytes: 87014275154,
          accelerated: true,
        },
      ],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
    expect(screen.getByText('GPU capacity')).toBeInTheDocument();
    expect(screen.getByText('172.21.0.1')).toBeInTheDocument();
    expect(screen.getByText('Backend host')).toBeInTheDocument();
    expect(screen.getByText('81.0 GiB free')).toBeInTheDocument();
    expect(
      screen.getByText('of 86.1 GiB · 5.0 GiB reserved'),
    ).toBeInTheDocument();
    expect(screen.getByText('accelerated')).toBeInTheDocument();
    expect(
      screen.getByText(/for the host a backend runs on/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'GPUs' }),
    ).not.toBeInTheDocument();
  });
});
