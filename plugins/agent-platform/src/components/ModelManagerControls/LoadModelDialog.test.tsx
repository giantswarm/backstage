import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
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
