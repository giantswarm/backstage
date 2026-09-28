import { PropsWithChildren, useState } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import type {
  ModelManagerFitResult,
  ModelManagerLoadAnswer,
} from '../../lib/modelManager';
import {
  NO_SERVING_CAPABILITIES,
  type ServedModel,
  type ServingCapabilities,
} from '../../lib/serving';
import { LoadModelDialog, type LoadTarget } from './LoadModelDialog';

const checkFit = jest.fn();
const loadModel = jest.fn();
const listPresets = jest.fn();
const onOpenChange = jest.fn();
const onServed = jest.fn();
let musterConnected = true;

jest.mock('../../hooks/useModelManagerBackends', () => ({
  useModelManagerToolsClient: (installation: string | undefined) =>
    musterConnected && installation
      ? { installation, checkFit, loadModel }
      : undefined,
}));
jest.mock('../../hooks/useServedModelAction', () => ({
  useInvalidateModelManagerReads: () => jest.fn(),
}));

const modelManagerApi = { listPresets } as unknown as ModelManagerApi;

const poolCapabilities: ServingCapabilities = {
  ...NO_SERVING_CAPABILITIES,
  load: true,
  unload: true,
  loadedModels: true,
  wire: true,
  presets: true,
  fitCheck: true,
};
const hostCapabilities: ServingCapabilities = {
  ...NO_SERVING_CAPABILITIES,
  pull: true,
  load: true,
  unload: true,
  loadedModels: true,
};

const pool: LoadTarget = {
  name: 'gazelle',
  backend: 'kserve',
  capabilities: poolCapabilities,
};
const host: LoadTarget = {
  name: 'lab',
  backend: 'ollama',
  capabilities: hostCapabilities,
};

const presets = [
  {
    name: 'qwen3-4b-instruct',
    displayName: 'Qwen3 4B Instruct',
    description: 'Chat and tools, 32k context',
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    weightsBytes: 8_060_000_000,
    gpus: 1,
  },
  {
    name: 'qwen3-8b-fp8',
    displayName: 'Qwen3 8B FP8',
    model: 'Qwen/Qwen3-8B-FP8',
    gpus: 1,
  },
];

const fits: ModelManagerFitResult = {
  model: 'qwen3-4b-instruct',
  fits: true,
  presets: [],
  instanceType: 'g6.xlarge',
  budgetSource: 'pool-scale-from-zero',
  cached: true,
  cacheSource: 'index',
  gated: false,
  private: false,
  tokenConfigured: false,
};
const NO_SIZE =
  'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB, the largest size g6.xlarge has 22 GB usable';
const doesNotFit: ModelManagerFitResult = {
  ...fits,
  model: 'qwen3-8b-fp8',
  fits: false,
  reason: NO_SIZE,
  cached: false,
  cacheSource: 'unknown',
};

const loaded: ModelManagerLoadAnswer = {
  name: 'qwen3-4b-instruct',
  backend: 'kserve',
  loaded: false,
  running: {
    resource: 'qwen3-4b-instruct',
    kind: 'LLMInferenceService',
    status: 'Pending',
    reason: 'WaitingForPod',
    phase: 'scheduling',
    steps: [
      {
        name: 'scheduling',
        state: 'inProgress',
        reason: 'WaitingForPod',
        message: 'waiting for the predictor pod',
      },
    ],
  },
  fit: fits,
};

const cachedOnHost: ServedModel = {
  id: 'lab/ollama/smollm2:135m',
  installation: 'lab',
  backend: 'ollama',
  name: 'smollm2:135m',
  readiness: 'available',
  endpointHosts: [],
  downloaded: true,
  loaded: false,
  sizeBytes: 270_000_000,
};

function render(
  props: Partial<React.ComponentProps<typeof LoadModelDialog>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[modelManagerApiRef, modelManagerApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderInTestApp(
    <Wrapper>
      <LoadModelDialog
        isOpen
        onOpenChange={onOpenChange}
        targets={[pool]}
        models={[]}
        onServed={onServed}
        {...props}
      />
    </Wrapper>,
  );
}

const serveButton = () => screen.getByRole('button', { name: /^Serve/ });

describe('LoadModelDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    musterConnected = true;
    listPresets.mockResolvedValue(presets);
    checkFit.mockImplementation(async ({ model }: { model: string }) =>
      model === 'qwen3-8b-fp8' ? doesNotFit : fits,
    );
    loadModel.mockResolvedValue(loaded);
  });

  it('lists the presets model-manager publishes, shows check_fit’s verdict, and serves with one load_model as the person', async () => {
    await render();

    await waitFor(() =>
      expect(listPresets).toHaveBeenCalledWith('gazelle', {
        backend: 'kserve',
      }),
    );
    await waitFor(() =>
      expect(checkFit).toHaveBeenCalledWith({
        model: 'qwen3-4b-instruct',
        backend: 'kserve',
      }),
    );
    const verdict = await screen.findByTestId('serve-fit-verdict');
    expect(verdict).toHaveTextContent('Fits — the node comes as g6.xlarge');
    expect(verdict).toHaveTextContent('weights cached (index)');
    expect(screen.getByText(/Chat and tools, 32k context/)).toBeInTheDocument();
    await waitFor(() => expect(serveButton()).toBeEnabled());

    await userEvent.click(serveButton());

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith({
        model: 'qwen3-4b-instruct',
        backend: 'kserve',
      }),
    );
    expect(loadModel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onServed).toHaveBeenCalledWith(pool, loaded);
  });

  it('cannot serve a preset no size of the pool hosts, and says why', async () => {
    await render();
    await screen.findByTestId('serve-fit-verdict');

    await userEvent.click(screen.getByRole('button', { name: /Preset/ }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Qwen3 8B FP8' }),
    );

    await waitFor(() =>
      expect(checkFit).toHaveBeenCalledWith({
        model: 'qwen3-8b-fp8',
        backend: 'kserve',
      }),
    );
    const verdict = screen.getByTestId('serve-fit-verdict');
    await waitFor(() =>
      expect(verdict).toHaveTextContent(
        `Cannot be served on this pool: ${NO_SIZE}`,
      ),
    );
    expect(serveButton()).toBeDisabled();
    expect(loadModel).not.toHaveBeenCalled();
  });

  it('preselects the recommended split across fast-linked nodes and serves it there', async () => {
    const sparkFit: ModelManagerFitResult = {
      ...fits,
      instanceType: undefined,
      node: 'spark-a',
      placement: 'copies',
      recommended: 'split',
      recommendedNodes: ['spark-a', 'spark-b'],
    };
    const splitFit: ModelManagerFitResult = {
      ...sparkFit,
      placement: 'split',
      nodes: ['spark-a', 'spark-b'],
      fastLink: 'sparks',
    };
    checkFit.mockImplementation(
      async ({ placement }: { placement?: string }) =>
        placement === 'split' ? splitFit : sparkFit,
    );
    await render();

    const split = await screen.findByRole('radio', {
      name: /Split across spark-a and spark-b.*\(recommended\)/,
    });
    await waitFor(() => expect(split).toBeChecked());
    const verdict = screen.getByTestId('serve-fit-verdict');
    await waitFor(() =>
      expect(verdict).toHaveTextContent(
        'Fits — split across spark-a and spark-b (fast link sparks)',
      ),
    );
    await waitFor(() => expect(serveButton()).toBeEnabled());
    await userEvent.click(serveButton());

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith({
        model: 'qwen3-4b-instruct',
        backend: 'kserve',
        placement: 'split',
        nodes: ['spark-a', 'spark-b'],
      }),
    );
  });

  it('serves one copy when the person picks it over the recommended split', async () => {
    const sparkFit: ModelManagerFitResult = {
      ...fits,
      instanceType: undefined,
      node: 'spark-a',
      placement: 'copies',
      recommended: 'split',
    };
    checkFit.mockImplementation(
      async ({ placement }: { placement?: string }) =>
        placement === 'split'
          ? { ...sparkFit, placement: 'split', nodes: ['spark-a', 'spark-b'] }
          : sparkFit,
    );
    await render();

    await userEvent.click(
      await screen.findByRole('radio', { name: /One copy on spark-a/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('serve-fit-verdict')).toHaveTextContent(
        'Fits — on spark-a',
      ),
    );
    await userEvent.click(serveButton());
    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith({
        model: 'qwen3-4b-instruct',
        backend: 'kserve',
      }),
    );
  });

  it('disables split with model-manager’s reason where no nodes share a fast link', async () => {
    const poolFit: ModelManagerFitResult = {
      ...fits,
      placement: 'copies',
      recommended: 'copies',
    };
    checkFit.mockImplementation(
      async ({ placement }: { placement?: string }) =>
        placement === 'split'
          ? {
              ...poolFit,
              fits: false,
              placement: 'split',
              reason: 'no fast link joins nodes on this cluster',
            }
          : poolFit,
    );
    await render();

    const split = await screen.findByRole('radio', {
      name: /Split across fast-linked nodes/,
    });
    await waitFor(() => expect(split).toBeDisabled());
    expect(
      screen.getByText('no fast link joins nodes on this cluster'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /One copy.*\(recommended\)/ }),
    ).toBeChecked();
  });

  it('offers no placement where model-manager recommends none', async () => {
    await render();
    await screen.findByTestId('serve-fit-verdict');
    expect(screen.queryByTestId('serve-placement')).not.toBeInTheDocument();
    expect(checkFit).not.toHaveBeenCalledWith(
      expect.objectContaining({ placement: 'split' }),
    );
  });

  it('keeps the chosen preset when the served list refetches the same targets', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The Serving page passes a new targets array on every poll.
    let refetch = () => {};
    const Harness = () => {
      const [targets, setTargets] = useState<LoadTarget[]>([pool]);
      refetch = () => setTargets([{ ...pool }]);
      return (
        <TestApiProvider apis={[[modelManagerApiRef, modelManagerApi]]}>
          <QueryClientProvider client={queryClient}>
            <LoadModelDialog
              isOpen
              onOpenChange={onOpenChange}
              targets={targets}
              models={[]}
            />
          </QueryClientProvider>
        </TestApiProvider>
      );
    };
    await renderInTestApp(<Harness />);
    await screen.findByTestId('serve-fit-verdict');

    await userEvent.click(screen.getByRole('button', { name: /Preset/ }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Qwen3 8B FP8' }),
    );
    await waitFor(() =>
      expect(checkFit).toHaveBeenCalledWith({
        model: 'qwen3-8b-fp8',
        backend: 'kserve',
      }),
    );
    act(() => refetch());

    expect(screen.getByRole('button', { name: /Preset/ })).toHaveTextContent(
      'Qwen3 8B FP8',
    );
  });

  it('blocks Serve while the fit check is pending or failed — never a guess', async () => {
    checkFit.mockRejectedValue(new Error('model-manager: deadline exceeded'));
    await render();

    const verdict = await screen.findByTestId('serve-fit-verdict');
    await waitFor(() => expect(verdict).toHaveTextContent('Fit check failed'));
    expect(verdict).toHaveTextContent('model-manager: deadline exceeded');
    expect(serveButton()).toBeDisabled();
  });

  it('opens on the pool the link names, installation and pool preselected', async () => {
    await render({
      targets: [host, pool],
      seed: {
        installation: 'gazelle',
        cluster: 'gazelle',
        pool: 'gpu-l4',
      },
    });

    expect(screen.getByTestId('serve-target')).toHaveTextContent(
      'On GPU pool gpu-l4 of cluster gazelle (gazelle)',
    );
    await waitFor(() =>
      expect(listPresets).toHaveBeenCalledWith('gazelle', {
        backend: 'kserve',
      }),
    );
    expect(
      screen.getByRole('button', { name: /Installation and backend/ }),
    ).toHaveTextContent('gazelle · KServe');
  });

  it('serves a cached model on a host backend without a fit check', async () => {
    await render({ targets: [host], models: [cachedOnHost] });

    expect(screen.queryByTestId('serve-fit-verdict')).not.toBeInTheDocument();
    expect(listPresets).not.toHaveBeenCalled();
    await waitFor(() => expect(serveButton()).toBeEnabled());
    expect(screen.getByRole('button', { name: /Model/ })).toHaveTextContent(
      'smollm2:135m',
    );

    await userEvent.click(serveButton());

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith({
        model: 'smollm2:135m',
        backend: 'ollama',
      }),
    );
    expect(checkFit).not.toHaveBeenCalled();
  });

  it('shows a preset that serves already as Serving on its node, and never serves it again', async () => {
    const servedPreset: ServedModel = {
      id: 'gazelle/kserve/kserve/qwen3-4b-instruct',
      installation: 'gazelle',
      backend: 'kserve',
      name: 'qwen3-4b-instruct',
      preset: 'qwen3-4b-instruct',
      readiness: 'ready',
      node: 'gpu-a',
      endpointHosts: [],
    };
    await render({
      models: [servedPreset],
      seed: { installation: 'gazelle', model: 'qwen3-4b-instruct' },
    });

    const note = await screen.findByTestId('serve-already-serving');
    expect(note).toHaveTextContent('Qwen3 4B Instruct: Serving on gpu-a');
    expect(note).toHaveTextContent('Stop it in the Serving list first');
    expect(serveButton()).toBeDisabled();
    expect(checkFit).not.toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen3-4b-instruct' }),
    );
    expect(loadModel).not.toHaveBeenCalled();
  });

  it('opens unseeded on the first preset that does not serve yet', async () => {
    const servedPreset: ServedModel = {
      id: 'gazelle/kserve/kserve/qwen3-4b-instruct',
      installation: 'gazelle',
      backend: 'kserve',
      name: 'qwen3-4b-instruct',
      preset: 'qwen3-4b-instruct',
      readiness: 'starting',
      node: 'gpu-a',
      endpointHosts: [],
    };
    await render({ models: [servedPreset] });

    await waitFor(() =>
      expect(checkFit).toHaveBeenCalledWith({
        model: 'qwen3-8b-fp8',
        backend: 'kserve',
      }),
    );
    expect(screen.queryByTestId('serve-already-serving')).toBeNull();
  });

  it('keeps a refused load in the dialog', async () => {
    loadModel.mockRejectedValue(
      new Error('does_not_fit: no size of the pool hosts the preset'),
    );
    await render();
    await waitFor(() => expect(serveButton()).toBeEnabled());

    await userEvent.click(serveButton());

    expect(
      await screen.findByText(
        'does_not_fit: no size of the pool hosts the preset',
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onServed).not.toHaveBeenCalled();
  });

  it('says when muster is not connected and offers no Serve', async () => {
    musterConnected = false;
    await render();

    expect(
      await screen.findByText(/muster is not connected for gazelle/),
    ).toBeInTheDocument();
    expect(serveButton()).toBeDisabled();
  });
});
