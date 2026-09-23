import { useState } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServingContextValue } from '../ServingProvider';
import type { ModelConfigsContextValue } from '../ModelConfigsProvider';
import type { ServedModel } from '../../lib/serving';
import type { PullJob, PullJobs } from '../../hooks/usePullJobs';
import type { ServedModelDownloadRow } from './ServedModelsTable';
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

jest.mock('../GpuNodePools', () => ({
  // cluster-manager is absent on these fleets: the controls render nothing.
  useGpuNodePoolControls: () => ({
    available: false,
    isLoading: false,
    addButton: undefined,
    dialogs: undefined,
    panel: undefined,
    cachePanel: undefined,
  }),
}));

jest.mock('../ModelBackends', () => ({
  // No model-manager the person can write to on these fleets: the controls
  // render nothing.
  useModelBackendControls: () => ({
    available: false,
    addButton: undefined,
    dialogs: null,
    renderGroupActions: () => null,
    renderBackendsWithoutModels: () => null,
  }),
}));

jest.mock('../ServingProvider', () => ({
  useServing: () => mockUseServing(),
}));

jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => mockUseModelConfigs(),
}));

// The write side: the stop mutation and the permission probe are mocked —
// their own tests cover them; here it is about what the section offers and
// what it does with the outcome. The Serve dialog is model-manager's
// (LoadModelDialog, reduced to a marker below): what matters here is when it
// is offered and what it is opened on.
const mockStop = jest.fn();
const mockUseSelfSubjectAccessReview = jest.fn();
const mockToastPost = jest.fn();
// The jobs list behind the download rows; the rows themselves are the real
// hook's work (useDownloadRows), including a dismissal.
const mockUsePullJobs = jest.fn<PullJobs, [string[]]>();
const mockCancelDownload = jest.fn();
const mockUseMusterPluginApi = jest.fn();

jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockUseMusterPluginApi(),
}));

jest.mock('../../hooks/useStopServedModel', () => ({
  useStopServedModel: () => ({
    stop: mockStop,
    isStopping: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/usePullJobs', () => ({
  usePullJobs: (installations: string[]) => mockUsePullJobs(installations),
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

// The model-manager controls are react-query/API-backed and tested on their
// own; here only *whether* the section mounts them, and what it hands them,
// matters. The row menu is reduced to one button per offer it received; the
// gate deciding which rows get a menu at all is the real one.
jest.mock('../ModelManagerControls', () => ({
  hasRowActions: jest.requireActual('../ModelManagerControls').hasRowActions,
  PullModelDialog: () => null,
  LoadModelDialog: ({
    isOpen,
    targets,
    seed,
  }: {
    isOpen: boolean;
    targets: { name: string }[];
    seed?: { installation?: string; model?: string };
  }) =>
    isOpen ? (
      <div data-testid="load-dialog">
        {targets.map(target => target.name).join(',')}
        {seed?.model ? ` seeded ${seed.installation}/${seed.model}` : ''}
      </div>
    ) : null,
  describeLoadTarget: (target: { name: string }) => target.name,
  ImportModelDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="import-dialog" /> : null,
  DownloadRowActions: ({
    row,
    onDismiss,
  }: {
    row: ServedModelDownloadRow;
    onDismiss: (row: ServedModelDownloadRow) => void;
  }) => (
    <>
      <button type="button" aria-label={`Actions for ${row.name}`} />
      {row.download.phase === 'failed' ? (
        <>
          <button type="button">Retry download {row.name}</button>
          <button type="button" onClick={() => onDismiss(row)}>
            Dismiss {row.name}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => mockCancelDownload(row)}>
          Cancel download {row.name}
        </button>
      )}
    </>
  ),
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
  modelSource: 'Qwen/Qwen3-14B',
  readiness: 'ready',
  node: 'gpu-node-1',
  nodeSource: 'pod',
  gpuCount: 1,
  internalUrl: 'https://models.example.test/kserve/qwen3-14b',
  endpointHosts: ['models.example.test'],
};

const baseServing: ServingContextValue = {
  scope: 'all',
  isLoading: false,
  installations: ['inst-1'],
  backends: { 'inst-1': 'kserve' },
  capabilities: { 'inst-1': KSERVE_CR_CAPABILITIES },
  unreachableInstallations: [],
  reachableInstallations: ['inst-1'],
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
    lookup.endpoint?.includes('/kserve/qwen3-14b') ? qwen : undefined,
  servedModelForEndpoint: () => undefined,
  servingStateFor: () => undefined,
  capabilitiesFor: () => KSERVE_CR_CAPABILITIES,
  loadingFor: () => undefined,
};

function modelConfig(name: string, baseUrl?: string) {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha3',
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
  scope: 'all',
  home: 'inst-1',
  installations: ['inst-1'],
  pendingInstallations: [],
  availableInstallations: ['inst-1'],
  unreachableInstallations: [],
  modelConfigsFor: () => [],
};

const noJobs: PullJobs = { jobs: [], isLoading: false, errors: [] };

/** A pull in flight on inst-2 (the Ollama installation below). */
const runningJob: PullJob = {
  installation: 'inst-2',
  id: 'running-1',
  type: 'pull',
  model: 'qwen2.5:0.5b',
  phase: 'running',
  status: 'pulling 6f7f…',
  bytesCompleted: 120_000_000,
  bytesTotal: 400_000_000,
  percent: 30,
  createdAt: '2026-09-02T13:00:00Z',
  wire: true,
};

const failedJob: PullJob = {
  ...runningJob,
  id: 'failed-1',
  model: 'nope:latest',
  phase: 'failed',
  status: undefined,
  error: 'pull model manifest: file does not exist',
  bytesCompleted: 0,
  bytesTotal: 0,
  percent: 0,
};

// The view's primary actions render into the shared page header, so the tree
// carries the header slot the app's GSPageLayout would provide — and the real
// rows provider (its inputs are the mocked contexts above), since what the view
// shows per row is the point of most cases here.
const HeaderActions = () => <>{usePageHeaderActionsSlot()}</>;

// Re-render the tree from inside it (renderInTestApp's own rerender would
// drop the test app around it), so a test can change what the mocked contexts
// answer and watch the view follow — the way a poll would.
let rerenderSection: () => void = () => {};
const Section = () => {
  const [, setTick] = useState(0);
  rerenderSection = () => setTick(tick => tick + 1);
  return (
    <PageHeaderActionsProvider>
      <HeaderActions />
      <ServedModelRowsProvider>
        <ServingPage />
      </ServedModelRowsProvider>
    </PageHeaderActionsProvider>
  );
};

const renderSection = () =>
  renderInTestApp(<Section />, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });

describe('ServingPage', () => {
  beforeEach(() => {
    mockUseServing.mockReset();
    mockUseModelConfigs.mockReset();
    mockStop.mockReset();
    mockToastPost.mockReset();
    mockUseSelfSubjectAccessReview.mockReset();
    mockUsePullJobs.mockReset();
    mockCancelDownload.mockReset();
    mockUseMusterPluginApi.mockReset();
    mockUseMusterPluginApi.mockReturnValue(undefined);
    window.sessionStorage.clear();
    mockUsePullJobs.mockReturnValue(noJobs);
    mockUseServing.mockReturnValue(baseServing);
    mockUseModelConfigs.mockReturnValue(baseModelConfigs);
    mockUseSelfSubjectAccessReview.mockReturnValue({
      allowed: true,
      isLoading: false,
    });
    mockStop.mockResolvedValue(undefined);
  });

  it('offers no Serve on a read-only CR source: serving is model-manager’s', async () => {
    await renderSection();

    expect(
      screen.queryByRole('button', { name: /Serve model/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/are how agents reach them/)).toBeInTheDocument();
    // Nothing is composed in the browser: no permission probe for a create.
    expect(mockUseSelfSubjectAccessReview).not.toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({ verb: 'create' }),
      expect.anything(),
    );
  });

  it('serves through model-manager as the person where a backend can load and muster is connected', async () => {
    mockUseMusterPluginApi.mockReturnValue({});
    mockUseServing.mockReturnValue({
      ...baseServing,
      capabilities: {
        'inst-1': {
          ...KSERVE_CR_CAPABILITIES,
          load: true,
          presets: true,
          fitCheck: true,
        },
      },
    });

    await renderSection();
    await userEvent.click(screen.getByRole('button', { name: /Serve model/ }));

    expect(screen.getByTestId('load-dialog')).toHaveTextContent('inst-1');
    expect(
      screen.getByText(/Serve a model from a curated preset or stop one/),
    ).toBeInTheDocument();
  });

  it('withholds Serve where a backend can load but muster is not connected', async () => {
    mockUseServing.mockReturnValue({
      ...baseServing,
      capabilities: {
        'inst-1': { ...KSERVE_CR_CAPABILITIES, load: true, presets: true },
      },
    });

    await renderSection();

    expect(
      screen.queryByRole('button', { name: /Serve model/ }),
    ).not.toBeInTheDocument();
  });

  it('offers "Stop serving…" on KServe rows and asks before deleting the CR', async () => {
    await renderSection();

    await userEvent.click(
      screen.getByRole('button', { name: 'Stop serving… qwen3-14b' }),
    );

    expect(screen.getByText('Stop serving "qwen3-14b"?')).toBeInTheDocument();
    expect(
      screen.getByText(
        /The LLMInferenceService qwen3-14b in kserve on inst-1 is deleted/,
      ),
    ).toBeInTheDocument();
    // A read-only CR source: the CR is deleted with the user's own RBAC.
    expect(mockUseSelfSubjectAccessReview).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({
        group: 'serving.kserve.io',
        resource: 'llminferenceservices',
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
      via: 'llminferenceservice',
    });
    await waitFor(() =>
      expect(mockToastPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Stopped serving "qwen3-14b"',
          description:
            'The workload is being removed; the weights stay cached on the node.',
        }),
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
        lookup.endpoint?.includes('/kserve/qwen3-14b') ? qwenFolded : undefined,
    };

    beforeEach(() => {
      // muster connected: the installation's model-manager can load, so the
      // Serve is its dialog.
      mockUseMusterPluginApi.mockReturnValue({});
      mockUseServing.mockReturnValue(mixedServing);
    });

    it('offers the Hugging Face import instead of the plain pull, and one menu per row', async () => {
      mockUsePullJobs.mockReturnValue({
        ...noJobs,
        jobs: [
          {
            ...runningJob,
            installation: 'inst-1',
            model: 'Qwen/Qwen3-8B',
            wire: false,
          },
        ],
      });

      await renderSection();

      expect(
        screen.getByRole('button', { name: /Import from Hugging Face/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Pull model/ }),
      ).not.toBeInTheDocument();
      // The pull in flight is a row of the KServe group, with the job's menu.
      expect(mockUsePullJobs).toHaveBeenCalledWith(['inst-1']);
      const grid = screen.getByRole('grid');
      expect(within(grid).getByText('Qwen/Qwen3-8B')).toBeInTheDocument();
      expect(within(grid).getByText('Downloading')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cancel download Qwen/Qwen3-8B' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Model downloads')).not.toBeInTheDocument();
      // The served LLMInferenceService: one menu, one stop.
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
        screen.getByText(/model-manager deletes the LLMInferenceService/),
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

    it('opens the Serve dialog on a cached download’s installation and preset', async () => {
      await renderSection();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Serve… mistralai/Devstral-Small-2-24B-Instruct-2512',
        }),
      );

      // model-manager's dialog, seeded with the preset the cached weights
      // belong to: it composes the LLMInferenceService; nothing is composed
      // here.
      expect(screen.getByTestId('load-dialog')).toHaveTextContent(
        'inst-1 seeded inst-1/devstral-small-2',
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
        /may not delete LLMInferenceService qwen3-14b in kserve on inst-1/,
      ),
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

  it('offers the registration when the model-manager in view runs no backend yet', async () => {
    // model-manager ships with zero backends: the installation is a serving
    // layer (the tabs exist), and this page is where a backend is registered.
    mockUseServing.mockReturnValue({
      ...baseServing,
      installations: ['inst-1'],
      backends: {},
      sourceBackends: { 'inst-1': [] },
      capabilities: {},
      servedModels: [],
      gpuNodes: [],
    });

    const { container } = await renderSection();

    expect(screen.getByText('No model backend yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        /model-manager on inst-1 is running with no backend registered/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No serving layer')).not.toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
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
    expect(screen.getByText('Qwen/Qwen3-14B')).toBeInTheDocument();
    expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
    expect(screen.queryByText('NVIDIA-GB10')).not.toBeInTheDocument();
  });

  it('links the ModelConfigs whose endpoint points at a served model', async () => {
    mockUseModelConfigs.mockReturnValue({
      ...baseModelConfigs,
      modelConfigsFor: () => [
        modelConfig(
          'qwen3-14b',
          'https://models.example.test/kserve/qwen3-14b/v1',
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

  it('surfaces installations whose LLMInferenceServices could not be read', async () => {
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
      endpointHosts: ['172.21.0.1:11434'],
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
      expect(mockUsePullJobs).toHaveBeenCalledWith(['inst-2']);
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
      // No installation can pull, so no job list is asked for.
      expect(mockUsePullJobs).toHaveBeenCalledWith([]);
      expect(screen.queryByText('GPU capacity')).not.toBeInTheDocument();
    });

    describe('downloads as rows', () => {
      beforeEach(() => {
        mockUseServing.mockReturnValue(ollamaServing);
      });

      it('shows a pull in flight as a Downloading row among the models, with its progress and Cancel, and no card below the table', async () => {
        mockUsePullJobs.mockReturnValue({ ...noJobs, jobs: [runningJob] });

        await renderSection();

        const grid = screen.getByRole('grid');
        const names = within(grid)
          .getAllByRole('rowheader')
          .map(cell => cell.textContent);
        expect(names).toHaveLength(2);
        expect(names[0]).toMatch(/^qwen2\.5:0\.5b/);
        expect(names[1]).toMatch(/^smollm2:135m/);
        expect(within(grid).getByText('Downloading')).toBeInTheDocument();
        expect(
          within(grid).getByText('pulling 6f7f… · 30 % · 114 MiB / 381 MiB'),
        ).toBeInTheDocument();
        expect(
          within(grid).getByRole('progressbar', {
            name: 'Downloading qwen2.5:0.5b',
          }),
        ).toHaveAttribute('aria-valuenow', '30');
        // The job's menu, not the model's.
        expect(
          screen.getByRole('button', { name: 'Cancel download qwen2.5:0.5b' }),
        ).toBeInTheDocument();
        expect(
          screen.getAllByRole('button', { name: 'Actions for qwen2.5:0.5b' }),
        ).toHaveLength(1);
        expect(screen.queryByText('Model downloads')).not.toBeInTheDocument();
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
      });

      it('turns the Downloading row into the model row once the pull is done', async () => {
        mockUsePullJobs.mockReturnValue({ ...noJobs, jobs: [runningJob] });
        await renderSection();
        expect(screen.getByText('Downloading')).toBeInTheDocument();

        // The job finishes; usePullJobs has invalidated the inventory, which
        // now lists the model.
        const pulled: ServedModel = {
          ...smollm,
          id: 'inst-2/ollama//qwen2.5:0.5b',
          name: 'qwen2.5:0.5b',
          modelSource: 'qwen2.5:0.5b',
          sizeBytes: 397_821_319,
          capabilities: ['completion', 'tools'],
        };
        mockUsePullJobs.mockReturnValue({
          ...noJobs,
          jobs: [{ ...runningJob, phase: 'succeeded', percent: 100 }],
        });
        mockUseServing.mockReturnValue({
          ...ollamaServing,
          servedModels: [smollm, pulled],
        });
        await act(async () => rerenderSection());

        await waitFor(() =>
          expect(screen.queryByText('Downloading')).not.toBeInTheDocument(),
        );
        const grid = screen.getByRole('grid');
        expect(within(grid).getAllByRole('rowheader')).toHaveLength(2);
        expect(within(grid).getByText('qwen2.5:0.5b')).toBeInTheDocument();
        expect(within(grid).getAllByText('Available')).toHaveLength(2);
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /Cancel download/ }),
        ).not.toBeInTheDocument();
        // A cancelled pull leaves the same way, at once.
        mockUsePullJobs.mockReturnValue({
          ...noJobs,
          jobs: [
            { ...runningJob, id: 'c', model: 'other:1b', phase: 'cancelled' },
          ],
        });
        await act(async () => rerenderSection());
        await waitFor(() =>
          expect(screen.queryByText('other:1b')).not.toBeInTheDocument(),
        );
      });

      it('keeps a failed pull as a Not ready row with the failure until it is dismissed', async () => {
        mockUsePullJobs.mockReturnValue({ ...noJobs, jobs: [failedJob] });

        await renderSection();

        const grid = screen.getByRole('grid');
        expect(within(grid).getByText('nope:latest')).toBeInTheDocument();
        expect(within(grid).getByText('Not ready')).toBeInTheDocument();
        expect(
          within(grid).getByText(
            'Download failed: pull model manifest: file does not exist',
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Retry download nope:latest' }),
        ).toBeInTheDocument();

        await userEvent.click(
          screen.getByRole('button', { name: 'Dismiss nope:latest' }),
        );

        await waitFor(() =>
          expect(screen.queryByText('nope:latest')).not.toBeInTheDocument(),
        );
        expect(within(grid).getAllByRole('rowheader')).toHaveLength(1);
        // Remembered for the tab: the same list renders without it.
        expect(
          JSON.parse(
            window.sessionStorage.getItem(
              'agent-platform.dismissed-downloads',
            ) ?? '[]',
          ),
        ).toEqual(['inst-2/failed-1']);
      });

      it('says when a job list could not be read', async () => {
        mockUsePullJobs.mockReturnValue({
          ...noJobs,
          errors: [
            {
              installation: 'inst-2',
              error: new Error('502 from the gateway'),
            },
          ],
        });

        await renderSection();

        expect(
          screen.getByText('Downloads could not be read'),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/inst-2: 502 from the gateway/),
        ).toBeInTheDocument();
      });

      it('puts a KServe download in the KServe group, on its node, next to an Ollama one', async () => {
        mockUseServing.mockReturnValue({
          ...ollamaServing,
          installations: ['inst-1', 'inst-2'],
          backends: { 'inst-1': 'kserve', 'inst-2': 'ollama' },
          capabilities: {
            ...ollamaServing.capabilities,
            'inst-1': {
              ...KSERVE_CR_CAPABILITIES,
              pull: true,
              pullProgress: true,
              search: true,
              nodeInventory: true,
            },
          },
          servedModels: [qwen, smollm],
        });
        mockUsePullJobs.mockReturnValue({
          ...noJobs,
          jobs: [
            runningJob,
            {
              ...runningJob,
              id: 'dl-1',
              installation: 'inst-1',
              model: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
              node: 'gpu-node-1',
              wire: false,
            },
          ],
        });

        await renderSection();

        expect(mockUsePullJobs).toHaveBeenCalledWith(['inst-2', 'inst-1']);
        const [kserveTable, ollamaTable] = screen.getAllByRole('grid');
        expect(
          within(kserveTable).getByText(
            'mistralai/Devstral-Small-2-24B-Instruct-2512',
          ),
        ).toBeInTheDocument();
        expect(
          within(kserveTable).getByText('Downloading'),
        ).toBeInTheDocument();
        expect(within(kserveTable).getAllByText('gpu-node-1')).toHaveLength(2);
        expect(
          within(ollamaTable).getByText('qwen2.5:0.5b'),
        ).toBeInTheDocument();
        expect(
          within(ollamaTable).getByText('Downloading'),
        ).toBeInTheDocument();
        expect(
          within(ollamaTable).queryByRole('columnheader', { name: 'Node' }),
        ).toBeNull();
      });
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
