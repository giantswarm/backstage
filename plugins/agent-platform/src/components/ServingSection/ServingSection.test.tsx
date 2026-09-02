import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServingContextValue } from '../ServingProvider';
import type { ModelConfigsContextValue } from '../ModelConfigsProvider';
import type { ServedModel } from '../../lib/serving';
import { modelsRouteRef } from '../../routes';
import { ServingSection } from './ServingSection';

// Drive the section's state branches through the two contexts it reads.
const mockUseServing = jest.fn<ServingContextValue, []>();
const mockUseModelConfigs = jest.fn<ModelConfigsContextValue, []>();

jest.mock('../ServingProvider', () => ({
  useServing: () => mockUseServing(),
}));

jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => mockUseModelConfigs(),
}));

const qwen: ServedModel = {
  id: 'inst-1/kserve/kserve/qwen3-14b',
  installation: 'inst-1',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'kserve',
  modelSource: 'hf://Qwen/Qwen3-14B',
  runtime: 'kserve-vllm',
  readiness: 'ready',
  node: 'gpu-node-1',
  nodeSource: 'pod',
  gpuCount: 1,
  internalUrl: 'http://qwen3-14b-predictor.kserve.svc.cluster.local',
  endpointHosts: [
    'qwen3-14b-predictor.kserve.svc.cluster.local',
    'qwen3-14b-predictor.kserve.svc',
    'qwen3-14b-predictor.kserve',
  ],
};

const baseServing: ServingContextValue = {
  isLoading: false,
  installations: ['inst-1'],
  backends: { 'inst-1': 'kserve' },
  unreachableInstallations: [],
  servedModels: [qwen],
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
  servedModelForEndpoint: () => undefined,
};

function modelConfig(name: string, baseUrl?: string) {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name, namespace: 'kagent' },
      spec: {
        provider: 'OpenAI',
        model: name,
        ...(baseUrl ? { openAI: { baseUrl } } : {}),
      },
    } as any,
    'inst-1',
  );
}

const baseModelConfigs: ModelConfigsContextValue = {
  isLoading: false,
  hasInstallations: true,
  availableInstallations: ['inst-1'],
  unreachableInstallations: [],
  modelConfigsFor: () => [],
};

const renderSection = () =>
  renderInTestApp(<ServingSection />, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });

describe('ServingSection', () => {
  beforeEach(() => {
    mockUseServing.mockReset();
    mockUseModelConfigs.mockReset();
    mockUseServing.mockReturnValue(baseServing);
    mockUseModelConfigs.mockReturnValue(baseModelConfigs);
  });

  it('renders nothing when no installation has a serving backend', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      installations: [],
      backends: {},
      servedModels: [],
      gpuNodes: [],
    });

    const { container } = await renderSection();

    expect(screen.queryByText('Serving')).not.toBeInTheDocument();
    expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
  });

  it('renders nothing while probing a fleet that has shown no backend yet', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      isLoading: true,
      installations: [],
      backends: {},
      servedModels: [],
      gpuNodes: [],
    });

    await renderSection();

    expect(screen.queryByText('Serving')).not.toBeInTheDocument();
    expect(screen.queryByTestId('progress')).not.toBeInTheDocument();
  });

  it('lists the served models and the GPU capacity once a backend is found', async () => {
    await renderSection();

    expect(screen.getByText('Serving')).toBeInTheDocument();
    expect(screen.getByText('qwen3-14b')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('hf://Qwen/Qwen3-14B')).toBeInTheDocument();
    expect(screen.getByText('GPU capacity')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA-GB10')).toBeInTheDocument();
  });

  it('links the ModelConfigs whose endpoint points at a served model', async () => {
    mockUseModelConfigs.mockReturnValue({
      ...baseModelConfigs,
      modelConfigsFor: () => [
        modelConfig(
          'qwen3-14b',
          'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
        ),
        modelConfig('claude'),
        modelConfig('other-vllm', 'https://vllm.example.test/v1'),
      ],
    });

    await renderSection();

    expect(screen.getByRole('link', { name: 'qwen3-14b' })).toHaveAttribute(
      'href',
      '/agent-platform/models/inst-1/kagent/qwen3-14b',
    );
    expect(screen.queryByText('claude')).not.toBeInTheDocument();
    expect(screen.queryByText('other-vllm')).not.toBeInTheDocument();
  });

  it('shows a progress bar while the first models load', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      isLoading: true,
      servedModels: [],
    });

    await renderSection();

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('surfaces installations whose InferenceServices could not be read', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      unreachableInstallations: ['inst-3'],
    });

    await renderSection();

    expect(
      screen.getByText("Couldn't read 1 installation"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/InferenceServices couldn't be read/),
    ).toBeInTheDocument();
    expect(screen.getByText(/inst-3/)).toBeInTheDocument();
  });

  it('still surfaces an unreadable installation when no backend was found elsewhere', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      installations: [],
      backends: {},
      servedModels: [],
      gpuNodes: [],
      unreachableInstallations: ['inst-3'],
    });

    await renderSection();

    expect(screen.getByText('Serving')).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't read 1 installation"),
    ).toBeInTheDocument();
    // No backend confirmed anywhere, so no capacity panel either.
    expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
  });
});
