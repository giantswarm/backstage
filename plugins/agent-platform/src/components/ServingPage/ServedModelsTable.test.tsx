import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { modelsRouteRef } from '../../routes';
import {
  columnsForRows,
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

/** Two models of an Ollama-backed model-manager: one loaded and wired, one not. */
const ollamaRows: ServedModelRow[] = [
  {
    id: 'lab/ollama//qwen3.5:9b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3.5:9b',
    modelSource: 'qwen3.5:9b',
    runtime: 'ollama 0.33.2',
    readiness: 'ready',
    readinessMessage: 'Loaded in memory until 13:05.',
    internalUrl: 'http://172.21.0.1:11434',
    endpointHosts: ['172.21.0.1'],
    sizeBytes: 6594474711,
    loaded: true,
    memoryBytes: 7_100_000_000,
    loadedUntil: '2026-09-02T13:05:00Z',
    capabilities: ['vision', 'completion', 'tools', 'thinking'],
    details: {
      parameterSize: '9.7B',
      quantization: 'Q4_K_M',
      contextLength: 262144,
    },
    modelConfig: { name: 'qwen3-5-9b', namespace: 'kagent', ready: true },
    usedBy: [],
  },
  {
    id: 'lab/ollama//gemma3:270m',
    installation: 'lab',
    backend: 'ollama',
    name: 'gemma3:270m',
    modelSource: 'gemma3:270m',
    runtime: 'ollama 0.33.2',
    readiness: 'available',
    readinessMessage: 'Downloaded; not loaded in memory.',
    internalUrl: 'http://172.21.0.1:11434',
    endpointHosts: ['172.21.0.1'],
    sizeBytes: 291554930,
    loaded: false,
    capabilities: ['completion'],
    details: { parameterSize: '268.10M', quantization: 'Q8_0' },
    usedBy: [],
  },
];

describe('columnsForRows', () => {
  it('keeps the placement columns by default and derives the rest from the rows', () => {
    expect(columnsForRows(rows)).toEqual({
      placement: true,
      size: false,
      memory: false,
      capabilities: false,
    });
    expect(columnsForRows(ollamaRows)).toEqual({
      placement: true,
      size: true,
      memory: true,
      capabilities: true,
    });
    expect(columnsForRows(ollamaRows, { placement: false }).placement).toBe(
      false,
    );
  });
});

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
      '/agent-platform/models/configs/inst-1/kagent/qwen3-14b',
    );
    expect(screen.getAllByText('No model config')).toHaveLength(2);
  });

  it('renders the empty state without rows', async () => {
    await renderTable(<ServedModelsTable rows={[]} />);

    expect(screen.getByText('No models are being served.')).toBeInTheDocument();
  });

  describe('with an inventory backend (Ollama through model-manager)', () => {
    it('adds Size, Memory and Features columns and drops placement when told to', async () => {
      await renderTable(
        <ServedModelsTable rows={ollamaRows} columns={{ placement: false }} />,
      );

      for (const header of ['Size', 'Memory', 'Features']) {
        expect(screen.getByText(header)).toBeInTheDocument();
      }
      expect(screen.queryByText('Node')).not.toBeInTheDocument();
      expect(screen.queryByText('GPUs')).not.toBeInTheDocument();
    });

    it('humanises sizes and shows the loaded state with footprint and expiry', async () => {
      await renderTable(
        <ServedModelsTable rows={ollamaRows} columns={{ placement: false }} />,
      );

      expect(screen.getByText('6.1 GiB')).toBeInTheDocument();
      expect(screen.getByText('278 MiB')).toBeInTheDocument();
      expect(screen.getByText('Loaded · 6.6 GiB')).toBeInTheDocument();
      expect(screen.getByText(/^until /)).toBeInTheDocument();
      expect(screen.getByText('Not loaded')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
    });

    it('describes each model from its details under the name', async () => {
      await renderTable(
        <ServedModelsTable rows={ollamaRows} columns={{ placement: false }} />,
      );

      expect(
        screen.getByText('Ollama · 9.7B · Q4_K_M · 256k ctx'),
      ).toBeInTheDocument();
      expect(screen.getByText('Ollama · 268.10M · Q8_0')).toBeInTheDocument();
    });

    it('lists the notable features and warns where agents cannot use the model', async () => {
      await renderTable(
        <ServedModelsTable rows={ollamaRows} columns={{ placement: false }} />,
      );

      expect(screen.getByText('vision, tools, thinking')).toBeInTheDocument();
      expect(screen.getByText('completion only')).toBeInTheDocument();
      expect(screen.getByText('No tool calling')).toBeInTheDocument();
      expect(
        screen.getByTitle(
          'Agents cannot use this model: it does not support tool calling.',
        ),
      ).toBeInTheDocument();
    });

    it('links the model config the backend created, even with no matching ModelConfig read', async () => {
      await renderTable(
        <ServedModelsTable rows={ollamaRows} columns={{ placement: false }} />,
      );

      expect(screen.getByRole('link', { name: 'qwen3-5-9b' })).toHaveAttribute(
        'href',
        '/agent-platform/models/configs/lab/kagent/qwen3-5-9b',
      );
      expect(screen.getByText('No model config')).toBeInTheDocument();
    });

    it('does not repeat a model config that is both read and backend-created', async () => {
      await renderTable(
        <ServedModelsTable
          rows={[
            {
              ...ollamaRows[0],
              usedBy: [
                {
                  installation: 'lab',
                  namespace: 'kagent',
                  name: 'qwen3-5-9b',
                  displayName: 'Qwen 3.5 (lab)',
                },
              ],
            },
          ]}
          columns={{ placement: false }}
        />,
      );

      expect(
        screen.getAllByRole('link', { name: /Qwen 3.5 \(lab\)|qwen3-5-9b/ }),
      ).toHaveLength(1);
    });

    it('renders the actions slot per row when given', async () => {
      await renderTable(
        <ServedModelsTable
          rows={ollamaRows}
          columns={{ placement: false }}
          renderActions={row => (
            <button type="button">act on {row.name}</button>
          )}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'act on qwen3.5:9b' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'act on gemma3:270m' }),
      ).toBeInTheDocument();
    });
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
  it('renders one actions column only when given a menu, and lets it decide per row', async () => {
    const ollamaRow: ServedModelRow = {
      ...rows[2],
      id: 'inst-2/ollama/qwen3:0.6b',
      backend: 'ollama',
      name: 'qwen3:0.6b',
      namespace: undefined,
    };

    const { unmount } = await renderTable(<ServedModelsTable rows={rows} />);
    expect(
      screen.queryByRole('columnheader', { name: 'Actions' }),
    ).not.toBeInTheDocument();
    unmount();

    // The section's menu decides per row; a row it declines gets an empty cell.
    await renderTable(
      <ServedModelsTable
        rows={[rows[0], ollamaRow]}
        renderActions={row =>
          row.backend === 'kserve' ? (
            <button type="button" aria-label={`Actions for ${row.name}`} />
          ) : null
        }
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Actions' }),
    ).toBeInTheDocument();
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
