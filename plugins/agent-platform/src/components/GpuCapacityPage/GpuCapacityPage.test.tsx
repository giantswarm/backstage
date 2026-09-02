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
});
