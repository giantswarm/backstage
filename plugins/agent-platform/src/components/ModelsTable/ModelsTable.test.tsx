import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { crds } from '@giantswarm/k8s-types';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelsRouteRef } from '../../routes';
import { ModelRow, ModelsTable, sortModelsBy, toModelRow } from './ModelsTable';

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
      '/agent-platform/models/inst-1/kagent/qwen3',
    );
  });

  it('navigates on a whole-row click', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    await userEvent.click(screen.getByText('qwen3-8-27b'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/models/inst-1/kagent/qwen3',
    );
  });

  it('renders the empty state without rows', async () => {
    await renderTable(<ModelsTable rows={[]} />);

    expect(screen.getByText('No models found.')).toBeInTheDocument();
  });

  it('names the served model behind an endpoint when one is known', async () => {
    await renderTable(
      <ModelsTable
        rows={[
          {
            ...rows[0],
            endpoint: 'http://qwen3-predictor.kserve.svc.cluster.local/v1',
            servedBy: {
              name: 'qwen3',
              namespace: 'kserve',
              backend: 'kserve',
              readiness: 'ready',
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
      'InferenceService kserve/qwen3 is ready — see the Serving section below',
    );
  });

  it('shows no serving line for endpoints that are not served in-cluster', async () => {
    await renderTable(<ModelsTable rows={rows} />);

    expect(screen.queryByText(/Served by/)).not.toBeInTheDocument();
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
        name: 'qwen3',
        namespace: 'kserve',
        backend: 'kserve',
        readiness: 'ready',
      },
    );

    expect(row.servedBy).toEqual({
      name: 'qwen3',
      namespace: 'kserve',
      backend: 'kserve',
      readiness: 'ready',
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
