import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { modelsRouteRef } from '../../routes';
import {
  ServedModelRow,
  ServedModelsTable,
  sortServedModelsBy,
} from './ServedModelsTable';

const renderTable = (element: React.ReactElement) =>
  renderInTestApp(element, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });

const rows: ServedModelRow[] = [
  {
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
    externalUrl: 'https://qwen3-14b.models.example.test',
    endpointHosts: [],
    usedBy: [
      {
        installation: 'inst-1',
        namespace: 'kagent',
        name: 'qwen3-14b',
        displayName: 'Qwen3 14B (lab vLLM)',
      },
    ],
  },
  {
    id: 'inst-1/kserve/kserve/devstral',
    installation: 'inst-1',
    backend: 'kserve',
    name: 'devstral',
    namespace: 'kserve',
    modelSource: 'hf://mistralai/Devstral',
    runtime: 'kserve-vllm',
    readiness: 'notReady',
    readinessMessage: 'Deployment does not have minimum availability.',
    node: 'gpu-node-1',
    nodeSource: 'spec',
    gpuCount: 1,
    internalUrl: 'http://devstral-predictor.kserve.svc.cluster.local',
    endpointHosts: [],
    usedBy: [],
  },
  {
    id: 'inst-2/kserve/kserve/fresh',
    installation: 'inst-2',
    backend: 'kserve',
    name: 'fresh',
    namespace: 'kserve',
    readiness: 'pending',
    endpointHosts: [],
    usedBy: [],
  },
];

describe('ServedModelsTable', () => {
  it('renders the column headers', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    for (const header of [
      'Served model',
      'Status',
      'Model',
      'Runtime',
      'Node',
      'GPUs',
      'Endpoint',
      'Used by',
      'Installation',
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it('renders status, source, node, GPUs and endpoints per row', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    expect(screen.getByText('qwen3-14b')).toBeInTheDocument();
    expect(screen.getAllByText('kserve · KServe')).toHaveLength(3);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('hf://Qwen/Qwen3-14B')).toBeInTheDocument();
    expect(screen.getAllByText('kserve-vllm')).toHaveLength(2);
    expect(
      screen.getByText('http://qwen3-14b-predictor.kserve.svc.cluster.local'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://qwen3-14b.models.example.test'),
    ).toBeInTheDocument();
    // A node only pinned by the spec says so; an observed one does not.
    expect(screen.getAllByText('gpu-node-1')).toHaveLength(2);
    expect(screen.getByText('pinned')).toBeInTheDocument();
  });

  it('explains a not-ready model in the status tooltip', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    expect(
      screen.getByTitle('Deployment does not have minimum availability.'),
    ).toBeInTheDocument();
  });

  it('shows dashes for what a fresh InferenceService does not have yet', async () => {
    await renderTable(<ServedModelsTable rows={[rows[2]]} />);

    // Model, runtime, node, GPUs and endpoint are all unknown.
    expect(screen.getAllByText('—')).toHaveLength(5);
  });

  it('links the ModelConfigs that use a served model to their detail pages', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    const link = screen.getByRole('link', { name: /Qwen3 14B \(lab vLLM\)/ });
    expect(link).toHaveAttribute(
      'href',
      '/agent-platform/models/inst-1/kagent/qwen3-14b',
    );
    expect(screen.getAllByText('No model config')).toHaveLength(2);
  });

  it('renders the empty state without rows', async () => {
    await renderTable(<ServedModelsTable rows={[]} />);

    expect(screen.getByText('No models are being served.')).toBeInTheDocument();
  });
});

describe('sortServedModelsBy', () => {
  it('sorts by the requested column with a stable tiebreaker', () => {
    const byReadiness = sortServedModelsBy(rows, {
      column: 'readiness',
      direction: 'ascending',
    });
    expect(byReadiness.map(row => row.name)).toEqual([
      'devstral',
      'fresh',
      'qwen3-14b',
    ]);

    const byGpus = sortServedModelsBy(rows, {
      column: 'gpuCount',
      direction: 'descending',
    });
    // Unknown GPU counts sort last in descending order.
    expect(byGpus.map(row => row.name)).toEqual([
      'devstral',
      'qwen3-14b',
      'fresh',
    ]);
  });
});

describe('ServedModelsTable actions and wiring', () => {
  it('offers the stop action only on stoppable backends, and only when asked to', async () => {
    const onStop = jest.fn();
    const ollamaRow: ServedModelRow = {
      ...rows[2],
      id: 'inst-2/ollama/qwen3:0.6b',
      backend: 'ollama',
      name: 'qwen3:0.6b',
      namespace: undefined,
    };

    const { unmount } = await renderTable(<ServedModelsTable rows={rows} />);
    expect(
      screen.queryByRole('button', { name: /Actions for/ }),
    ).not.toBeInTheDocument();
    unmount();

    await renderTable(
      <ServedModelsTable rows={[rows[0], ollamaRow]} onStop={onStop} />,
    );

    expect(
      screen.getByRole('button', { name: 'Actions for qwen3-14b' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for qwen3:0.6b' }),
    ).not.toBeInTheDocument();
  });

  it('shows where a model came from and how its wiring is going', async () => {
    await renderTable(
      <ServedModelsTable
        rows={[
          {
            ...rows[1],
            preset: 'devstral-small-2',
            wiring: { status: 'wiring' },
          },
          {
            ...rows[2],
            wiring: {
              status: 'conflict',
              message: 'name taken by another config',
            },
          },
        ]}
      />,
    );

    expect(
      screen.getByText('kserve · KServe · preset devstral-small-2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Creating model config…')).toBeInTheDocument();
    expect(screen.getByText('Model config name taken')).toBeInTheDocument();
    expect(
      screen.getByTitle('name taken by another config'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No model config')).not.toBeInTheDocument();
  });
});
