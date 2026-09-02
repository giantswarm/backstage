import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServingContextValue } from '../ServingProvider';
import type { ModelConfigsContextValue } from '../ModelConfigsProvider';
import type { ServedModel } from '../../lib/serving';
import type {
  ModelServingConfig,
  ServingPreset,
} from '../../lib/servingPresets';
import type { ServingPresets } from '../../hooks/useServingPresets';
import type { WiringState } from '../../hooks/useAutoWireServedModels';
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

// The write side: presets read, the two mutations, the auto-wiring and the
// permission probe are all mocked — their own tests cover them; here it is
// about what the section offers and what it does with the outcome.
const mockUseServingPresets = jest.fn<ServingPresets, [string[]]>();
const mockServe = jest.fn();
const mockStop = jest.fn();
const mockWiringFor = jest.fn<WiringState | undefined, [string]>();
const mockUseSelfSubjectAccessReview = jest.fn();
const mockToastPost = jest.fn();

jest.mock('../../hooks/useServingPresets', () => ({
  useServingPresets: (installations: string[]) =>
    mockUseServingPresets(installations),
}));

jest.mock('../../hooks/useServeModel', () => ({
  useServeModel: () => ({
    serve: mockServe,
    isServing: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useStopServedModel', () => ({
  useStopServedModel: () => ({
    stop: mockStop,
    isStopping: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useAutoWireServedModels', () => ({
  useAutoWireServedModels: () => ({
    wiringFor: (id: string) => mockWiringFor(id),
  }),
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useSelfSubjectAccessReview: (...args: unknown[]) =>
    mockUseSelfSubjectAccessReview(...args),
}));

jest.mock('@backstage/frontend-plugin-api', () => {
  const actual = jest.requireActual('@backstage/frontend-plugin-api');
  return {
    ...actual,
    useApi: (ref: unknown) =>
      ref === actual.toastApiRef ? { post: mockToastPost } : actual.useApi(ref),
  };
});

const noPresets: ServingPresets = {
  isLoading: false,
  installations: [],
  configFor: () => undefined,
  presetsFor: () => [],
  problems: [],
  invalidPresets: [],
};

const config: ModelServingConfig = {
  installation: 'inst-1',
  namespace: 'model-serving',
  runtime: 'kserve-vllm',
  gpuResourceName: 'nvidia.com/gpu',
  nodeSelector: {},
  cache: { enabled: false, redirectPolicy: false },
  presets: {
    namespace: 'agent-platform',
    matchingLabels: { 'agent-platform.giantswarm.io/serving-preset': 'true' },
    names: ['qwen3-14b'],
  },
};

const preset: ServingPreset = {
  installation: 'inst-1',
  name: 'qwen3-14b',
  displayName: 'Qwen3 14B',
  model: {
    id: 'Qwen/Qwen3-14B',
    storageUri: 'hf://Qwen/Qwen3-14B',
    format: 'vLLM',
    capabilities: [],
  },
  args: [],
  env: [],
  resources: { gpus: 1, requests: {}, limits: {} },
  requirements: { weightsGiB: 28, overheadGiB: 30 },
  scheduling: { nodeSelector: {}, tolerations: [] },
  predictor: {},
};

const withPresets: ServingPresets = {
  ...noPresets,
  installations: ['inst-1'],
  configFor: () => config,
  presetsFor: () => [preset],
};

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
    mockUseServingPresets.mockReset();
    mockServe.mockReset();
    mockStop.mockReset();
    mockWiringFor.mockReset();
    mockToastPost.mockReset();
    mockUseSelfSubjectAccessReview.mockReset();
    mockUseServing.mockReturnValue(baseServing);
    mockUseModelConfigs.mockReturnValue(baseModelConfigs);
    mockUseServingPresets.mockReturnValue(noPresets);
    mockUseSelfSubjectAccessReview.mockReturnValue({
      allowed: true,
      isLoading: false,
    });
    mockServe.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);
  });

  it('asks for presets only on the installations with a KServe backend', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      installations: ['inst-1', 'inst-2'],
      backends: { 'inst-1': 'kserve', 'inst-2': 'ollama' },
    });

    await renderSection();

    expect(mockUseServingPresets).toHaveBeenCalledWith(['inst-1']);
  });

  it('offers "Serve model" only where presets are published', async () => {
    const { unmount } = await renderSection();
    expect(
      screen.queryByRole('button', { name: /Serve model/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Read-only|are how agents reach them/),
    ).toBeInTheDocument();
    unmount();

    mockUseServingPresets.mockReturnValue(withPresets);
    await renderSection();

    expect(
      screen.getByRole('button', { name: /Serve model/ }),
    ).toBeInTheDocument();
  });

  it("opens the serve dialog seeded with the installation's presets and creates the composed InferenceService", async () => {
    mockUseServingPresets.mockReturnValue(withPresets);

    await renderSection();
    await userEvent.click(screen.getByRole('button', { name: /Serve model/ }));

    expect(screen.getByText('Serve a model')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'qwen3-14b',
    );
    // The permission probe asks about creating InferenceServices there.
    expect(mockUseSelfSubjectAccessReview).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({
        group: 'serving.kserve.io',
        resource: 'inferenceservices',
        namespace: 'model-serving',
        verb: 'create',
      }),
      expect.objectContaining({ enabled: true }),
    );

    // The served qwen3-14b already exists in the fixture's namespace `kserve`,
    // not in `model-serving`, so the default name is free.
    await userEvent.click(screen.getByRole('button', { name: 'Serve model' }));

    await waitFor(() => expect(mockServe).toHaveBeenCalledTimes(1));
    expect(mockServe).toHaveBeenCalledWith({
      installation: 'inst-1',
      namespace: 'model-serving',
      manifest: expect.objectContaining({
        kind: 'InferenceService',
        metadata: expect.objectContaining({
          name: 'qwen3-14b',
          namespace: 'model-serving',
        }),
      }),
    });
    await waitFor(() =>
      expect(mockToastPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Serving "Qwen3 14B" as qwen3-14b',
          status: 'success',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('Serve a model')).not.toBeInTheDocument(),
    );
  });

  it('offers "Stop serving…" on KServe rows and asks before stopping', async () => {
    await renderSection();

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for qwen3-14b' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Stop serving/ }),
    );

    expect(screen.getByText('Stop serving "qwen3-14b"?')).toBeInTheDocument();
    expect(mockUseSelfSubjectAccessReview).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({
        resource: 'inferenceservices',
        namespace: 'kserve',
        name: 'qwen3-14b',
        verb: 'delete',
      }),
      { enabled: true },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Stop serving' }));

    await waitFor(() => expect(mockStop).toHaveBeenCalledTimes(1));
    expect(mockStop.mock.calls[0][0]).toMatchObject({ name: 'qwen3-14b' });
    await waitFor(() =>
      expect(mockToastPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Stopped serving "qwen3-14b"' }),
      ),
    );
  });

  it('explains a stop the user is not allowed to do', async () => {
    mockUseSelfSubjectAccessReview.mockReturnValue({
      allowed: false,
      isLoading: false,
    });

    await renderSection();
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for qwen3-14b' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Stop serving/ }),
    );

    expect(
      screen.getByText(
        /may not delete InferenceService qwen3-14b in kserve on inst-1/,
      ),
    ).toBeInTheDocument();
  });

  it('shows the auto-wiring progress in the "Used by" column', async () => {
    mockWiringFor.mockReturnValue({
      status: 'error',
      message: 'The model config could not be created: forbidden',
    });

    await renderSection();

    expect(screen.getByText('Model config not created')).toBeInTheDocument();
    expect(
      screen.getByTitle('The model config could not be created: forbidden'),
    ).toBeInTheDocument();
  });

  it('warns when presets could not be read or are unusable', async () => {
    mockUseServingPresets.mockReturnValue({
      ...withPresets,
      problems: [
        { installation: 'inst-1', message: 'configmaps is forbidden' },
      ],
      invalidPresets: [
        { installation: 'inst-1', name: 'broken', error: 'no displayName' },
      ],
    });

    await renderSection();

    expect(
      screen.getByText('Serving presets could not be read'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/inst-1: configmaps is forbidden/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 serving preset is unusable'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/broken \(inst-1\): no displayName/),
    ).toBeInTheDocument();
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
