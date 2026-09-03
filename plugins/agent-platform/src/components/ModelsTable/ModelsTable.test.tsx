import { PropsWithChildren } from 'react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { crds } from '@giantswarm/k8s-types';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import {
  NO_SERVING_CAPABILITIES,
  type ClientServingState,
  type ServedModel,
} from '../../lib/serving';
import { modelsRouteRef } from '../../routes';
import {
  isModelRowMuted,
  ModelRow,
  ModelServedBy,
  ModelsTable,
  sortModelsBy,
  toModelRow,
  toModelServedBy,
} from './ModelsTable';

// The row's programmatic navigation, and *only* it: `Link` resolves
// `useNavigate` internally within react-router-dom, so its own client-side
// navigation is untouched by this mock. A call here means the row handler ran.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Only the parent RouteRef is mountable — `mountedRoutes` rejects a
// SubRouteRef — and the detail sub-route resolves relative to it.
const renderTable = (element: React.ReactElement) =>
  renderInTestApp(element, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });

const rows: ModelRow[] = [
  {
    id: 'inst-1/kagent/qwen3',
    installation: 'inst-1',
    namespace: 'kagent',
    name: 'qwen3',
    displayName: 'Qwen 3 (lab vLLM)',
    provider: 'OpenAI',
    model: 'qwen3-8-27b',
    endpoint: 'https://vllm.example.test/v1',
    readiness: 'accepted',
  },
  {
    id: 'inst-1/kagent/default-model-config',
    installation: 'inst-1',
    namespace: 'kagent',
    name: 'default-model-config',
    displayName: 'default-model-config',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-6',
    endpoint: '',
    readiness: 'notAccepted',
    readinessMessage: 'referenced Secret kagent-anthropic not found',
  },
];

describe('ModelsTable', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the column headers', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    expect(screen.getByText('Model config')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Endpoint')).toBeInTheDocument();
    expect(screen.getByText('Installation')).toBeInTheDocument();
  });

  it('renders each row with status and endpoint fallback', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    expect(screen.getByText('Qwen 3 (lab vLLM)')).toBeInTheDocument();
    // The technical name shows beneath a differing display name.
    expect(screen.getByText('qwen3')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Not accepted')).toBeInTheDocument();
    expect(
      screen.getByText('https://vllm.example.test/v1'),
    ).toBeInTheDocument();
    // Empty endpoint reads as the provider's default, not as "unknown".
    expect(screen.getByText('Provider default')).toBeInTheDocument();
  });

  it('links the name to the model detail page', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    const link = screen.getByRole('link', { name: /Qwen 3 \(lab vLLM\)/ });
    expect(link).toHaveAttribute(
      'href',
      '/agent-platform/models/configs/inst-1/kagent/qwen3',
    );
  });

  it('navigates on a whole-row click', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    await userEvent.click(screen.getByText('qwen3-8-27b'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/models/configs/inst-1/kagent/qwen3',
    );
  });

  it('renders the empty state without rows', async () => {
    await renderTable(<ModelsTable rows={[]} />);

    expect(screen.getByText('No models found.')).toBeInTheDocument();
  });

  it('names the served model behind an endpoint when one is known, with its state', async () => {
    await renderTable(
      <ModelsTable
        rows={[
          {
            ...rows[0],
            endpoint: 'http://qwen3-predictor.kserve.svc.cluster.local/v1',
            servedBy: {
              installation: 'inst-1',
              name: 'qwen3',
              namespace: 'kserve',
              backend: 'kserve',
              readiness: 'ready',
              message: 'InferenceService qwen3 is ready.',
            },
          },
        ]}
      />,
    );

    const servedBy = screen.getByText(/Served by InferenceService/);
    expect(servedBy).toHaveTextContent(
      'Served by InferenceService kserve/qwen3',
    );
    expect(servedBy).toHaveAttribute(
      'title',
      'InferenceService kserve/qwen3 is ready — InferenceService qwen3 is ready.',
    );
    // The state is a label, not only a tooltip.
    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Ready',
    );
  });

  it('shows no serving line for endpoints that are not served in-cluster', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    expect(screen.queryByText(/Served by/)).not.toBeInTheDocument();
  });
});

// --- The serving state and its shortcut --------------------------------------

const loadModel = jest.fn();
const pullModel = jest.fn();
const post = jest.fn();

const modelManagerApi = {
  loadModel,
  pullModel,
} as unknown as ModelManagerApi;

/** With the APIs and query client the inline Load / Pull button needs. */
const renderTableWithApis = (element: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [modelManagerApiRef, modelManagerApi],
        [toastApiRef, { post }],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderTable(<Wrapper>{element}</Wrapper>);
};

const ollamaRow: ModelRow = {
  id: 'lab/kagent/qwen3-0-6b',
  installation: 'lab',
  namespace: 'kagent',
  name: 'qwen3-0-6b',
  displayName: 'qwen3-0-6b',
  provider: 'Ollama',
  model: 'qwen3:0.6b',
  endpoint: 'http://172.21.0.1:11434',
  readiness: 'accepted',
};

const idleServedBy: ModelServedBy = {
  installation: 'lab',
  backend: 'ollama',
  readiness: 'idle',
  name: 'qwen3:0.6b',
  message:
    'Downloaded; not loaded. Ollama loads it on the first request, so an agent’s first turn pays the cold start.',
};

const goneServedBy: ModelServedBy = {
  installation: 'lab',
  backend: 'ollama',
  readiness: 'notServing',
  name: 'qwen2.5:0.5b',
  message:
    'Ollama model qwen2.5:0.5b is not on the backend at 172.21.0.1 — deleted, or never pulled.',
};

describe('ModelsTable serving state', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    loadModel.mockReset();
    pullModel.mockReset();
    post.mockReset();
    loadModel.mockResolvedValue({});
    pullModel.mockResolvedValue({ job: { id: 'j1' }, created: true });
  });

  it('labels a not-loaded Ollama model Idle — ordinary state, no warning, not greyed', async () => {
    await renderTable(
      <ModelsTable rows={[{ ...ollamaRow, servedBy: idleServedBy }]} />,
    );

    expect(screen.getByText(/Served by Ollama model/)).toHaveTextContent(
      'Served by Ollama model qwen3:0.6b',
    );
    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Idle',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Serving view')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'qwen3-0-6b' }).closest('td'),
    ).not.toHaveStyle('opacity: 0.55');
  });

  it('offers Load inline for an idle model the backend can load', async () => {
    await renderTableWithApis(
      <ModelsTable
        rows={[
          {
            ...ollamaRow,
            servedBy: {
              ...idleServedBy,
              shortcut: { kind: 'load', ref: 'qwen3:0.6b' },
            },
          },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Load qwen3:0.6b' }),
    );

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith('lab', { model: 'qwen3:0.6b' }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen3:0.6b: loaded into memory',
          status: 'success',
        }),
      ),
    );
    // The button press is not a row press: no navigation to the detail page.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('greys a model config whose Ollama model is gone and offers to pull it', async () => {
    await renderTableWithApis(
      <ModelsTable
        rows={[
          {
            ...ollamaRow,
            id: 'lab/kagent/qwen2-5-0-5b',
            name: 'qwen2-5-0-5b',
            displayName: 'qwen2-5-0-5b',
            model: 'qwen2.5:0.5b',
            servedBy: {
              ...goneServedBy,
              shortcut: { kind: 'pull', ref: 'qwen2.5:0.5b' },
            },
          },
        ]}
      />,
    );

    // Not "served by": nothing serves it.
    expect(screen.getByText(/Points at Ollama model/)).toHaveTextContent(
      'Points at Ollama model qwen2.5:0.5b',
    );
    expect(screen.getByTestId('model-serving-readiness')).toHaveTextContent(
      'Not serving',
    );
    expect(
      screen.getByRole('link', { name: 'qwen2-5-0-5b' }).closest('td'),
    ).toHaveStyle('opacity: 0.55');

    await userEvent.click(
      screen.getByRole('button', { name: 'Pull qwen2.5:0.5b' }),
    );

    // The ModelConfig exists — that is the whole situation — so no wiring.
    await waitFor(() =>
      expect(pullModel).toHaveBeenCalledWith('lab', {
        model: 'qwen2.5:0.5b',
        wire: false,
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'qwen2.5:0.5b: pull started',
          status: 'success',
        }),
      ),
    );
  });

  it('says Serve on a KServe model config whose InferenceService is gone', async () => {
    await renderTableWithApis(
      <ModelsTable
        rows={[
          {
            ...rows[0],
            endpoint:
              'http://lab-echo-predictor.model-serving.svc.cluster.local/v1',
            servedBy: {
              installation: 'inst-1',
              backend: 'kserve',
              readiness: 'notServing',
              name: 'lab-echo',
              namespace: 'model-serving',
              message:
                'InferenceService model-serving/lab-echo is not serving — stopped, or never created.',
              shortcut: { kind: 'load', ref: 'lab-echo' },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/Points at InferenceService/)).toHaveTextContent(
      'Points at InferenceService model-serving/lab-echo',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Serve lab-echo' }),
    );

    await waitFor(() =>
      expect(loadModel).toHaveBeenCalledWith('inst-1', { model: 'lab-echo' }),
    );
  });

  it('links to the Serving view when nothing can be done inline', async () => {
    await renderTable(
      <ModelsTable
        rows={[
          {
            ...ollamaRow,
            servedBy: goneServedBy,
          },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Serving view' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reports a failed shortcut through a toast and stays put', async () => {
    loadModel.mockRejectedValue(new Error('backend is busy'));
    await renderTableWithApis(
      <ModelsTable
        rows={[
          {
            ...ollamaRow,
            servedBy: {
              ...idleServedBy,
              shortcut: { kind: 'load', ref: 'qwen3:0.6b' },
            },
          },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Load qwen3:0.6b' }),
    );

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Load failed for qwen3:0.6b',
          description: 'backend is busy',
          status: 'danger',
        }),
      ),
    );
  });
});

describe('toModelServedBy / isModelRowMuted', () => {
  const served: ServedModel = {
    id: 'lab/ollama//qwen3:0.6b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3:0.6b',
    readiness: 'idle',
    readinessMessage: 'Downloaded; not loaded.',
    endpointHosts: ['172.21.0.1:11434'],
    loaded: false,
    managerRef: 'qwen3:0.6b',
    operable: true,
  };
  const state: ClientServingState = {
    installation: 'lab',
    backend: 'ollama',
    readiness: 'idle',
    name: 'qwen3:0.6b',
    message: 'Downloaded; not loaded.',
    model: served,
  };

  it('keeps the plain state and adds the shortcut the capabilities allow', () => {
    expect(
      toModelServedBy(state, { ...NO_SERVING_CAPABILITIES, load: true }),
    ).toEqual({
      installation: 'lab',
      backend: 'ollama',
      readiness: 'idle',
      name: 'qwen3:0.6b',
      message: 'Downloaded; not loaded.',
      shortcut: { kind: 'load', ref: 'qwen3:0.6b' },
    });
    expect(toModelServedBy(state, NO_SERVING_CAPABILITIES).shortcut).toBe(
      undefined,
    );
  });

  it('mutes only rows whose model is not serving', () => {
    expect(isModelRowMuted({ ...ollamaRow, servedBy: idleServedBy })).toBe(
      false,
    );
    expect(isModelRowMuted({ ...ollamaRow, servedBy: goneServedBy })).toBe(
      true,
    );
    expect(isModelRowMuted(ollamaRow)).toBe(false);
  });
});

describe('toModelRow', () => {
  it('derives display data including the readiness tooltip message', () => {
    const row = toModelRow(
      new ModelConfig(
        {
          apiVersion: 'kagent.dev/v1alpha2',
          kind: 'ModelConfig',
          metadata: {
            name: 'qwen3',
            namespace: 'kagent',
            generation: 1,
            annotations: { 'ui.giantswarm.io/display-name': 'Qwen 3' },
          },
          spec: {
            provider: 'OpenAI',
            model: 'qwen3-8-27b',
            openAI: { baseUrl: 'https://vllm.example.test/v1' },
          },
          status: {
            observedGeneration: 1,
            conditions: [
              {
                type: 'Accepted',
                status: 'False',
                reason: 'SecretNotFound',
                message: 'referenced Secret not found',
                lastTransitionTime: '2026-09-01T00:00:00Z',
              },
            ],
          },
        } as crds.kagent.v1alpha2.ModelConfig,
        'inst-1',
      ),
    );

    expect(row).toEqual({
      id: 'inst-1/kagent/qwen3',
      installation: 'inst-1',
      namespace: 'kagent',
      name: 'qwen3',
      displayName: 'Qwen 3',
      provider: 'OpenAI',
      model: 'qwen3-8-27b',
      endpoint: 'https://vllm.example.test/v1',
      readiness: 'notAccepted',
      readinessMessage: 'referenced Secret not found',
    });
  });

  it('attaches the served model link when given one', () => {
    const row = toModelRow(
      new ModelConfig(
        {
          apiVersion: 'kagent.dev/v1alpha2',
          kind: 'ModelConfig',
          metadata: { name: 'qwen3', namespace: 'kagent' },
          spec: { provider: 'OpenAI', model: 'qwen3-8-27b' },
        } as crds.kagent.v1alpha2.ModelConfig,
        'inst-1',
      ),
      {
        installation: 'inst-1',
        name: 'qwen3',
        namespace: 'kserve',
        backend: 'kserve',
        readiness: 'ready',
        message: 'InferenceService qwen3 is ready.',
      },
    );

    expect(row.servedBy).toEqual({
      installation: 'inst-1',
      name: 'qwen3',
      namespace: 'kserve',
      backend: 'kserve',
      readiness: 'ready',
      message: 'InferenceService qwen3 is ready.',
    });
  });
});

describe('sortModelsBy', () => {
  it('sorts by the requested column with a stable tiebreaker', () => {
    const sorted = sortModelsBy(rows, {
      column: 'provider',
      direction: 'ascending',
    });
    expect(sorted.map(row => row.provider)).toEqual(['Anthropic', 'OpenAI']);

    const reversed = sortModelsBy(rows, {
      column: 'provider',
      direction: 'descending',
    });
    expect(reversed.map(row => row.provider)).toEqual(['OpenAI', 'Anthropic']);
  });
});
