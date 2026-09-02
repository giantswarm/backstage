import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
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
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsSlot,
} from '@giantswarm/backstage-plugin-ui-react';
import { modelsRouteRef } from '../../routes';
import { KSERVE_CR_CAPABILITIES } from '../ServingProvider/useKServeServingSource';
import { ServedModelRowsProvider } from '../ServedModelRowsProvider';
import { ServingPage } from './ServingPage';

// Drive the view's state branches through the two contexts it reads.
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

// The model-manager controls are react-query/API-backed and tested on their
// own; here only *whether* the section mounts them, and what it hands them,
// matters. The row menu is reduced to one button per offer it received; the
// gate deciding which rows get a menu at all is the real one.
jest.mock('../ModelManagerControls', () => ({
  hasRowActions: jest.requireActual('../ModelManagerControls').hasRowActions,
  PullModelDialog: () => null,
  ImportModelDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="import-dialog" /> : null,
  PullJobsPanel: () => <div data-testid="pull-jobs-panel" />,
  ServedModelActions: ({
    model,
    onServe,
    onStop,
  }: {
    model: ServedModel;
    onServe?: (model: ServedModel) => void;
    onStop?: (model: ServedModel) => void;
  }) => (
    <>
      <button type="button" aria-label={`Actions for ${model.name}`} />
      {onServe && (
        <button type="button" onClick={() => onServe(model)}>
          Serve… {model.name}
        </button>
      )}
      {onStop && (
        <button type="button" onClick={() => onStop(model)}>
          Stop serving… {model.name}
        </button>
      )}
    </>
  ),
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
  capabilities: { 'inst-1': KSERVE_CR_CAPABILITIES },
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
  servedModelFor: (_installation, lookup) =>
    lookup.endpoint?.includes('qwen3-14b-predictor') ? qwen : undefined,
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

// The view's primary actions render into the shared page header, so the tree
// carries the header slot the app's GSPageLayout would provide — and the real
// rows provider (its inputs are the mocked contexts above), since what the view
// shows per row is the point of most cases here.
const HeaderActions = () => <>{usePageHeaderActionsSlot()}</>;

const renderSection = () =>
  renderInTestApp(
    <PageHeaderActionsProvider>
      <HeaderActions />
      <ServedModelRowsProvider>
        <ServingPage />
      </ServedModelRowsProvider>
    </PageHeaderActionsProvider>,
    {
      mountedRoutes: { '/agent-platform/models': modelsRouteRef },
    },
  );

describe('ServingPage', () => {
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
    mockStop.mockImplementation(async ({ via }: { via: string }) => ({ via }));
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

  it('offers "Stop serving…" on KServe rows and asks before deleting the CR', async () => {
    await renderSection();

    await userEvent.click(
      screen.getByRole('button', { name: 'Stop serving… qwen3-14b' }),
    );

    expect(screen.getByText('Stop serving "qwen3-14b"?')).toBeInTheDocument();
    // A read-only CR source: the CR is deleted with the user's own RBAC.
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
    expect(mockStop.mock.calls[0][0]).toMatchObject({
      model: { name: 'qwen3-14b' },
      via: 'inferenceservice',
    });
    await waitFor(() =>
      expect(mockToastPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Stopped serving "qwen3-14b"' }),
      ),
    );
  });

  describe('on a KServe installation with a model-manager (one row, one menu)', () => {
    const kserveManagerCapabilities = {
      pull: true,
      pullProgress: true,
      delete: true,
      load: true,
      unload: true,
      loadedModels: true,
      wire: true,
      presets: true,
      fitCheck: true,
      nodeInventory: true,
      search: true,
    };
    // The CR row after the provider folded model-manager's view onto it.
    const qwenFolded: ServedModel = {
      ...qwen,
      managerRef: 'Qwen/Qwen3-14B',
      sizeBytes: 29_540_000_000,
      downloaded: true,
      cachePath: 'qwen3-14b',
      loaded: true,
      modelConfig: { name: 'qwen3-14b', namespace: 'kagent', managed: false },
      operable: true,
    };
    const devstral: ServedModel = {
      id: 'inst-1/kserve/cache/gpu-node-1/devstral-small-2',
      installation: 'inst-1',
      backend: 'kserve',
      name: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
      modelSource: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
      readiness: 'available',
      readinessMessage: 'Downloaded on gpu-node-1; not serving.',
      node: 'gpu-node-1',
      endpointHosts: [],
      managerRef: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
      sizeBytes: 48_000_000_000,
      downloaded: true,
      cachePath: 'devstral-small-2',
      preset: 'devstral-small-2',
      loaded: false,
      operable: true,
    };
    const mixedServing: ServingContextValue = {
      ...baseServing,
      capabilities: { 'inst-1': kserveManagerCapabilities },
      servedModels: [qwenFolded, devstral],
      servedModelFor: (_installation, lookup) =>
        lookup.endpoint?.includes('qwen3-14b-predictor')
          ? qwenFolded
          : undefined,
    };
    const devstralPreset: ServingPreset = {
      ...preset,
      name: 'devstral-small-2',
      displayName: 'Devstral Small 2',
      model: {
        id: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
        storageUri: 'hf://mistralai/Devstral-Small-2-24B-Instruct-2512',
        format: 'vLLM',
        capabilities: ['tools'],
      },
    };

    beforeEach(() => {
      mockUseServing.mockReturnValue(mixedServing);
      mockUseServingPresets.mockReturnValue({
        ...withPresets,
        presetsFor: () => [preset, devstralPreset],
      });
    });

    it('offers the Hugging Face import instead of the plain pull, and one menu per row', async () => {
      await renderSection();

      expect(
        screen.getByRole('button', { name: /Import from Hugging Face/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Pull model/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('pull-jobs-panel')).toBeInTheDocument();
      // The served InferenceService: one menu, one stop.
      expect(
        screen.getAllByRole('button', { name: 'Actions for qwen3-14b' }),
      ).toHaveLength(1);
      expect(
        screen.getByRole('button', { name: 'Stop serving… qwen3-14b' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Serve… qwen3-14b/ }),
      ).not.toBeInTheDocument();
      // The cached download: serve, not stop.
      expect(
        screen.getByRole('button', {
          name: 'Serve… mistralai/Devstral-Small-2-24B-Instruct-2512',
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /Stop serving… mistralai/,
        }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/downloaded, not serving/)).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: /Import from Hugging Face/ }),
      );
      expect(screen.getByTestId('import-dialog')).toBeInTheDocument();
    });

    it('stops a row model-manager operates through model-manager, without asking the cluster', async () => {
      await renderSection();

      await userEvent.click(
        screen.getByRole('button', { name: 'Stop serving… qwen3-14b' }),
      );

      expect(screen.getByText('Stop serving "qwen3-14b"?')).toBeInTheDocument();
      expect(
        screen.getByText(/model-manager deletes the InferenceService/),
      ).toBeInTheDocument();
      expect(mockUseSelfSubjectAccessReview).toHaveBeenLastCalledWith(
        'inst-1',
        expect.anything(),
        { enabled: false },
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Stop serving' }),
      );

      await waitFor(() => expect(mockStop).toHaveBeenCalledTimes(1));
      expect(mockStop.mock.calls[0][0]).toMatchObject({
        model: { name: 'qwen3-14b', managerRef: 'Qwen/Qwen3-14B' },
        via: 'model-manager',
      });
      await waitFor(() =>
        expect(mockToastPost).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining('model-manager is removing'),
          }),
        ),
      );
    });

    it('says what happened when model-manager handed the stop back to the CR delete', async () => {
      mockStop.mockResolvedValue({ via: 'inferenceservice' });
      await renderSection();

      await userEvent.click(
        screen.getByRole('button', { name: 'Stop serving… qwen3-14b' }),
      );
      expect(
        screen.getByText(/deleted with your own permissions instead/),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Stop serving' }),
      );

      await waitFor(() =>
        expect(mockToastPost).toHaveBeenCalledWith(
          expect.objectContaining({
            description:
              'The predictor is being removed; the weights stay cached on the node.',
          }),
        ),
      );
    });

    it('opens the serve dialog seeded with a cached download: its preset, cache directory and node', async () => {
      await renderSection();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Serve… mistralai/Devstral-Small-2-24B-Instruct-2512',
        }),
      );

      expect(screen.getByText('Serve a model')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Preset/ })).toHaveTextContent(
        'Devstral Small 2',
      );
      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
        'devstral-small-2',
      );
      expect(
        screen.getByRole('button', { name: /Target node/ }),
      ).toHaveTextContent('gpu-node-1');
      expect(screen.getByRole('button', { name: /Weights/ })).toHaveTextContent(
        'mistralai/Devstral-Small-2-24B-Instruct-2512 · on gpu-node-1 · 44.7 GiB',
      );
    });
  });

  it('explains a stop the user is not allowed to do', async () => {
    mockUseSelfSubjectAccessReview.mockReturnValue({
      allowed: false,
      isLoading: false,
    });

    await renderSection();
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop serving… qwen3-14b' }),
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

  it('explains the empty state when no installation has a serving backend', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      installations: [],
      backends: {},
      servedModels: [],
      gpuNodes: [],
    });

    const { container } = await renderSection();

    expect(screen.getByText('No serving layer')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
    // Nothing to offer, so nothing goes to the header.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows progress, not the empty state, while probing a fleet that has shown no backend yet', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      isLoading: true,
      installations: [],
      backends: {},
      servedModels: [],
      gpuNodes: [],
    });

    await renderSection();

    expect(screen.queryByText('No serving layer')).not.toBeInTheDocument();
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('lists the served models once a backend is found, without the GPU capacity (its own view)', async () => {
    await renderSection();

    expect(
      screen.getByText(/Models served on the installations/),
    ).toBeInTheDocument();
    expect(screen.getByText('qwen3-14b')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('hf://Qwen/Qwen3-14B')).toBeInTheDocument();
    expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
    expect(screen.queryByText('NVIDIA-GB10')).not.toBeInTheDocument();
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
      '/agent-platform/models/configs/inst-1/kagent/qwen3-14b',
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
      screen.getByText(/served models couldn't be read/),
    ).toBeInTheDocument();
    expect(screen.getByText(/inst-3/)).toBeInTheDocument();
  });

  describe('on an Ollama-backed model-manager installation (no node inventory)', () => {
    const smollm: ServedModel = {
      id: 'inst-2/ollama//smollm2:135m',
      installation: 'inst-2',
      backend: 'ollama',
      name: 'smollm2:135m',
      modelSource: 'smollm2:135m',
      runtime: 'ollama 0.33.2',
      readiness: 'available',
      endpointHosts: ['172.21.0.1'],
      sizeBytes: 270_898_672,
      loaded: false,
      capabilities: ['completion'],
      operable: true,
    };
    const ollamaServing: ServingContextValue = {
      ...baseServing,
      installations: ['inst-2'],
      backends: { 'inst-2': 'ollama' },
      capabilities: {
        'inst-2': {
          pull: true,
          pullProgress: true,
          delete: true,
          load: true,
          unload: true,
          loadedModels: true,
          wire: true,
          presets: false,
          fitCheck: false,
          nodeInventory: false,
          search: false,
        },
      },
      servedModels: [smollm],
      gpuNodes: [],
    };

    it('renders the controls the capabilities allow and no GPU panel or placement columns', async () => {
      mockUseServing.mockReturnValue(ollamaServing);

      await renderSection();

      expect(
        screen.getByText(/pull a model onto a backend/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Pull model/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Actions for smollm2:135m' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('pull-jobs-panel')).toBeInTheDocument();
      // Capability skew is state, not an error: nothing GPU-shaped renders.
      expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
      expect(screen.queryByText('Node')).not.toBeInTheDocument();
      expect(screen.queryByText('GPUs')).not.toBeInTheDocument();
      // What the backend shares sits in the group header; the size under the
      // name; the tool-calling gap is an icon. No cell reads "—".
      expect(
        screen.getByRole('heading', { name: 'Ollama 0.33.2' }),
      ).toBeInTheDocument();
      expect(screen.getByText('258 MiB')).toBeInTheDocument();
      expect(
        screen.getByRole('img', { name: 'No tool calling' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
    });

    it('keeps Node and GPUs on a KServe installation next to it, off the Ollama rows', async () => {
      mockUseServing.mockReturnValue({
        ...ollamaServing,
        installations: ['inst-1', 'inst-2'],
        backends: { 'inst-1': 'kserve', 'inst-2': 'ollama' },
        capabilities: {
          ...ollamaServing.capabilities,
          'inst-1': {
            ...KSERVE_CR_CAPABILITIES,
            nodeInventory: true,
          },
        },
        servedModels: [qwen, smollm],
      });

      await renderSection();

      const [kserveTable, ollamaTable] = screen.getAllByRole('grid');
      expect(
        within(kserveTable).getByRole('columnheader', { name: 'Node' }),
      ).toBeInTheDocument();
      expect(within(kserveTable).getByText('gpu-node-1')).toBeInTheDocument();
      expect(
        within(ollamaTable).queryByRole('columnheader', { name: 'Node' }),
      ).toBeNull();
      expect(within(ollamaTable).queryByText('—')).toBeNull();
    });

    it('offers no controls on a read-only source', async () => {
      mockUseServing.mockReturnValue({
        ...ollamaServing,
        capabilities: undefined,
      });

      await renderSection();

      expect(
        screen.queryByRole('button', { name: /Pull model/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Actions for/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('pull-jobs-panel')).not.toBeInTheDocument();
      expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
    });
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

    expect(screen.queryByText('No serving layer')).not.toBeInTheDocument();
    expect(
      screen.getByText("Couldn't read 1 installation"),
    ).toBeInTheDocument();
  });
});
