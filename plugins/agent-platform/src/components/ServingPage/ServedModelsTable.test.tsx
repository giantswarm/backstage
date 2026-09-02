import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { modelsRouteRef } from '../../routes';
import { describeGroup } from './ServedModelsGroupHeader';
import {
  columnsForRows,
  groupServedModelRows,
  memoryLine,
  ServedModelRow,
  ServedModelsTable,
  servedModelStatusLines,
  sortServedModelsBy,
} from './ServedModelsTable';

const renderTable = (element: React.ReactElement) =>
  renderInTestApp(element, {
    mountedRoutes: { '/agent-platform/models': modelsRouteRef },
  });

/** Three InferenceServices on two installations, read as CRs. */
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

/** A KServe model-manager's rows: a served InferenceService and a cached download. */
const kserveManagerRows: ServedModelRow[] = [
  {
    ...rows[0],
    managerRef: 'Qwen/Qwen3-14B',
    sizeBytes: 29_540_000_000,
    downloaded: true,
    cachePath: 'qwen3-14b',
    loaded: true,
    preset: 'qwen3-14b',
    capabilities: ['tools'],
  },
  {
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
    usedBy: [],
  },
];

describe('columnsForRows', () => {
  it('derives every optional column from the rows, placement from a node on a row', () => {
    expect(columnsForRows(rows)).toEqual({
      placement: true,
      model: true,
      runtime: false,
      capabilities: false,
    });
    expect(columnsForRows(ollamaRows)).toEqual({
      placement: false,
      model: false,
      runtime: false,
      capabilities: true,
    });
    // A fresh InferenceService alone: nothing placed, nothing to show yet.
    expect(columnsForRows([rows[2]])).toEqual({
      placement: false,
      model: false,
      runtime: false,
      capabilities: false,
    });
  });

  it('shows the runtime as a column only when the rows run on more than one', () => {
    expect(columnsForRows(rows).runtime).toBe(false);
    expect(
      columnsForRows([rows[0], { ...rows[1], runtime: 'kserve-tgi' }]).runtime,
    ).toBe(true);
  });
});

describe('groupServedModelRows', () => {
  it('groups by installation and backend, carrying what every row shares', () => {
    const groups = groupServedModelRows([
      ...ollamaRows,
      ...rows,
      { ...ollamaRows[0], id: 'inst-1/ollama//x', installation: 'inst-1' },
    ]);

    expect(
      groups.map(group => [
        group.key,
        group.rows.length,
        group.runtime,
        group.endpoint,
      ]),
    ).toEqual([
      ['inst-1/kserve', 2, 'kserve-vllm', undefined],
      ['inst-1/ollama', 1, 'ollama 0.33.2', 'http://172.21.0.1:11434'],
      ['inst-2/kserve', 1, undefined, undefined],
      ['lab/ollama', 2, 'ollama 0.33.2', 'http://172.21.0.1:11434'],
    ]);
  });
});

describe('describeGroup', () => {
  it('names the backend with its runtime version, without repeating itself', () => {
    expect(describeGroup({ backend: 'ollama', runtime: 'ollama 0.33.2' })).toBe(
      'Ollama 0.33.2',
    );
    expect(describeGroup({ backend: 'kserve', runtime: 'kserve-vllm' })).toBe(
      'KServe · kserve-vllm',
    );
    expect(describeGroup({ backend: 'kserve' })).toBe('KServe');
  });
});

describe('memoryLine and servedModelStatusLines', () => {
  it('tells the memory state from the row alone', () => {
    expect(memoryLine({ loaded: undefined })).toBeUndefined();
    expect(memoryLine({ loaded: false })).toBe('Not loaded');
    expect(memoryLine({ loaded: true })).toBeUndefined();
    expect(memoryLine({ loaded: true, memoryBytes: 5_800_000_000 })).toBe(
      '5.4 GiB in memory',
    );
    expect(
      memoryLine({
        loaded: true,
        memoryBytes: 5_800_000_000,
        loadedUntil: '2026-09-02T13:05:00Z',
      }),
    ).toMatch(/^5\.4 GiB in memory · evicts \d/);
    expect(
      memoryLine({ loaded: true, loadedUntil: '2026-09-02T13:05:00Z' }),
    ).toMatch(/^In memory · evicts \d/);
    expect(servedModelStatusLines(rows[0])).toEqual([]);
    expect(servedModelStatusLines(ollamaRows[1])).toEqual(['Not loaded']);
  });
});

describe('ServedModelsTable', () => {
  it('renders one group per installation, named when there is more than one', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    expect(screen.getByRole('heading', { name: 'inst-1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'inst-2' })).toBeInTheDocument();
    expect(screen.getByText('KServe · kserve-vllm')).toBeInTheDocument();
    expect(screen.getByText('KServe')).toBeInTheDocument();
    expect(screen.getAllByRole('grid')).toHaveLength(2);
  });

  it('renders the columns the InferenceServices call for, and no Runtime, Endpoint or Installation column', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    const [first, second] = screen.getAllByRole('grid');
    for (const header of [
      'Served model',
      'Status',
      'Model',
      'Node',
      'GPUs',
      'Used by',
    ]) {
      expect(
        within(first).getByRole('columnheader', { name: header }),
      ).toBeInTheDocument();
    }
    for (const header of [
      'Runtime',
      'Endpoint',
      'Installation',
      'Size',
      'Memory',
      'Features',
    ]) {
      expect(screen.queryByRole('columnheader', { name: header })).toBeNull();
    }
    // The fresh InferenceService has no node and no source yet: its group has
    // neither column.
    expect(
      within(second).queryByRole('columnheader', { name: 'Node' }),
    ).toBeNull();
    expect(
      within(second).queryByRole('columnheader', { name: 'Model' }),
    ).toBeNull();
  });

  it('renders status, source, node and GPUs per row, and a copy action for each endpoint', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    expect(screen.getByText('qwen3-14b')).toBeInTheDocument();
    expect(screen.getAllByText('kserve')).toHaveLength(3);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('hf://Qwen/Qwen3-14B')).toBeInTheDocument();
    // The endpoints differ per InferenceService, so each row carries its own
    // copy action and the group header none.
    expect(
      screen.queryByText('http://qwen3-14b-predictor.kserve.svc.cluster.local'),
    ).toBeNull();
    const copies = screen.getAllByRole('button', { name: 'Copy endpoint' });
    expect(copies).toHaveLength(2);
    expect(
      screen.getByTitle(
        'Copy http://qwen3-14b-predictor.kserve.svc.cluster.local',
      ),
    ).toBeInTheDocument();
    // A node only pinned by the spec says so; an observed one does not.
    expect(screen.getAllByText('gpu-node-1')).toHaveLength(2);
    expect(screen.getByText('pinned')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('copies an endpoint to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await renderTable(<ServedModelsTable rows={ollamaRows} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Copy endpoint' }),
    );

    expect(writeText).toHaveBeenCalledWith('http://172.21.0.1:11434');
    expect(
      await screen.findByRole('button', { name: 'Endpoint copied' }),
    ).toBeInTheDocument();
  });

  it('explains a not-ready model in the status tooltip', async () => {
    await renderTable(<ServedModelsTable rows={rows} />);

    expect(
      screen.getByTitle('Deployment does not have minimum availability.'),
    ).toBeInTheDocument();
  });

  it('shows a fresh InferenceService with nothing but its name and status', async () => {
    await renderTable(<ServedModelsTable rows={[rows[2]]} />);

    expect(screen.getByText('fresh')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText('—')).toBeNull();
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
    expect(screen.queryByRole('grid')).toBeNull();
  });

  describe('with an Ollama-backed model-manager', () => {
    it('puts the backend, runtime version and endpoint in the group header and leads with them for a single installation', async () => {
      await renderTable(<ServedModelsTable rows={ollamaRows} />);

      expect(
        screen.getByRole('heading', { name: 'Ollama 0.33.2' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'lab' })).toBeNull();
      expect(screen.getByText('http://172.21.0.1:11434')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Copy endpoint' }),
      ).toBeInTheDocument();
    });

    it('shows name, status, features, used by — and no placement, model, runtime or dash', async () => {
      await renderTable(<ServedModelsTable rows={ollamaRows} />);

      for (const header of ['Served model', 'Status', 'Features', 'Used by']) {
        expect(
          screen.getByRole('columnheader', { name: header }),
        ).toBeInTheDocument();
      }
      for (const header of [
        'Model',
        'Runtime',
        'Node',
        'GPUs',
        'Endpoint',
        'Size',
        'Memory',
        'Installation',
      ]) {
        expect(screen.queryByRole('columnheader', { name: header })).toBeNull();
      }
      expect(screen.queryByText('—')).toBeNull();
    });

    it('describes each model under its name: size, parameters, quantisation, context', async () => {
      await renderTable(<ServedModelsTable rows={ollamaRows} />);

      expect(
        screen.getByText('6.1 GiB · 9.7B · Q4_K_M · 256k ctx'),
      ).toBeInTheDocument();
      expect(screen.getByText('278 MiB · 268.10M · Q8_0')).toBeInTheDocument();
    });

    it('tells the memory state under the status', async () => {
      await renderTable(<ServedModelsTable rows={ollamaRows} />);

      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(
        screen.getByText(/^6\.6 GiB in memory · evicts \d/),
      ).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('Not loaded')).toBeInTheDocument();
      expect(
        screen.getByTitle('Loaded in memory until 13:05.'),
      ).toBeInTheDocument();
    });

    it('shows the features that matter to agents as chips and the tool-calling gap as an icon', async () => {
      await renderTable(<ServedModelsTable rows={ollamaRows} />);

      for (const feature of ['vision', 'tools', 'thinking']) {
        expect(screen.getByText(feature)).toBeInTheDocument();
      }
      expect(screen.queryByText('completion')).toBeNull();
      expect(screen.queryByText('completion only')).toBeNull();
      const warning = screen.getByRole('img', { name: 'No tool calling' });
      expect(warning).toHaveAttribute(
        'title',
        'Agents cannot use this model: it does not support tool calling.',
      );
      // The full list stays a hover away.
      expect(
        screen.getByTitle('vision, completion, tools, thinking'),
      ).toBeInTheDocument();
    });

    it('links the model config the backend created, even with no matching ModelConfig read', async () => {
      await renderTable(<ServedModelsTable rows={ollamaRows} />);

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

  describe('on a mixed fleet (Ollama and KServe installations)', () => {
    it('gives each installation its own columns: Node and GPUs on the KServe rows only, no dashes on the Ollama rows', async () => {
      await renderTable(
        <ServedModelsTable rows={[...ollamaRows, ...kserveManagerRows]} />,
      );

      expect(
        screen.getByRole('heading', { name: 'inst-1' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'lab' })).toBeInTheDocument();
      expect(screen.getByText('Ollama 0.33.2')).toBeInTheDocument();
      expect(screen.getByText('KServe · kserve-vllm')).toBeInTheDocument();

      const [kserveTable, ollamaTable] = screen.getAllByRole('grid');
      expect(
        within(kserveTable).getByRole('columnheader', { name: 'Node' }),
      ).toBeInTheDocument();
      expect(
        within(kserveTable).getByRole('columnheader', { name: 'GPUs' }),
      ).toBeInTheDocument();
      expect(
        within(ollamaTable).queryByRole('columnheader', { name: 'Node' }),
      ).toBeNull();
      expect(
        within(ollamaTable).queryByRole('columnheader', { name: 'GPUs' }),
      ).toBeNull();
      expect(within(ollamaTable).queryByText('—')).toBeNull();
    });

    it('keeps node, GPUs, preset and cache on the KServe rows', async () => {
      await renderTable(<ServedModelsTable rows={kserveManagerRows} />);

      expect(
        screen.getByText('kserve · preset qwen3-14b · in the cache · 27.5 GiB'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'preset devstral-small-2 · downloaded, not serving · 44.7 GiB',
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByText('gpu-node-1')).toHaveLength(2);
      // The GPU request of the served one; the cached download requests none.
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
      // A model whose source is its own name says nothing twice.
      expect(screen.getByText('hf://Qwen/Qwen3-14B')).toBeInTheDocument();
      expect(
        screen.getAllByText('mistralai/Devstral-Small-2-24B-Instruct-2512'),
      ).toHaveLength(1);
      // Served: no memory figures on KServe, so the status stands alone.
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('Not loaded')).toBeInTheDocument();
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
      screen.getAllByRole('columnheader', { name: 'Actions' }),
    ).toHaveLength(2);
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
      screen.getByText('kserve · preset devstral-small-2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Creating model config…')).toBeInTheDocument();
    expect(screen.getByText('Model config name taken')).toBeInTheDocument();
    expect(
      screen.getByTitle('name taken by another config'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No model config')).not.toBeInTheDocument();
  });
});
