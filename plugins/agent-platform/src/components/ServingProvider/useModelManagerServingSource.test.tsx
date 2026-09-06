import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import type { ModelManagerApi } from '../../apis/ModelManagerApi';
import backendOllama from '../../lib/__fixtures__/model-manager.backend.ollama.json';
import backendKserve from '../../lib/__fixtures__/model-manager.backend.kserve.json';
import modelsOllama from '../../lib/__fixtures__/model-manager.models.ollama.json';
import modelsKserve from '../../lib/__fixtures__/model-manager.models.kserve.json';
import nodesKserve from '../../lib/__fixtures__/model-manager.nodes.kserve.json';
import nodesOllama from '../../lib/__fixtures__/model-manager.nodes.ollama.json';
import {
  modelManagerBackendSchema,
  modelManagerModelSchema,
  modelManagerNodeSchema,
  parseModelManagerList,
} from '../../lib/modelManager';
import { useModelManagerServingSource } from './useModelManagerServingSource';
import {
  modelManagerBackendQueryKey,
  modelManagerBackendsQueryKey,
} from '../../lib/queryKeys';

const listInstallations = jest.fn();
const listBackends = jest.fn();
const listModels = jest.fn();
const listNodes = jest.fn();

const modelManagerApi = {
  listInstallations,
  listBackends,
  listModels,
  listNodes,
} as unknown as ModelManagerApi;

const ollama = modelManagerBackendSchema.parse(backendOllama);
const kserve = modelManagerBackendSchema.parse(backendKserve);
const ollamaModels = parseModelManagerList(
  modelsOllama,
  'models',
  modelManagerModelSchema,
);
const kserveModels = parseModelManagerList(
  modelsKserve,
  'models',
  modelManagerModelSchema,
);
const kserveNodes = parseModelManagerList(
  nodesKserve,
  'nodes',
  modelManagerNodeSchema,
);

function namedError(name: string, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function renderSource(
  reachable = ['lab', 'gpu', 'plain'],
  seed?: (queryClient: QueryClient) => void,
) {
  // Retries off so a rejected read settles immediately.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seed?.(queryClient);
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[modelManagerApiRef, modelManagerApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useModelManagerServingSource(reachable), {
    wrapper,
  });
}

beforeEach(() => {
  listInstallations.mockReset();
  listBackends.mockReset();
  listModels.mockReset();
  listNodes.mockReset();
  listNodes.mockResolvedValue(kserveNodes);
  listInstallations.mockResolvedValue(['lab', 'gpu']);
  // One backend per installation, as a model-manager before 0.17 (or one
  // running a single backend) reports it.
  listBackends.mockImplementation(async (installation: string) => [
    installation === 'gpu' ? kserve : ollama,
  ]);
  listModels.mockImplementation(async (installation: string) =>
    installation === 'gpu' ? kserveModels : ollamaModels,
  );
});

describe('useModelManagerServingSource', () => {
  it('reads only the reachable installations the backend proxies a model-manager for', async () => {
    const { result } = renderSource(['lab', 'plain']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listBackends).toHaveBeenCalledTimes(1);
    expect(listBackends).toHaveBeenCalledWith('lab');
    expect(listModels).toHaveBeenCalledWith('lab');
    expect(result.current.installations).toEqual(['lab']);
  });

  it('contributes nothing when no installation has a model-manager', async () => {
    listInstallations.mockResolvedValue([]);

    const { result } = renderSource();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      isLoading: false,
      installations: [],
      backends: {},
      sourceBackends: {},
      capabilities: {},
      backendCapabilities: {},
      loading: {},
      backendLoading: {},
      sharedHosts: {},
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
    expect(listBackends).not.toHaveBeenCalled();
  });

  it('reports how the backend loads and the host every model answers on, once the inventory is read', async () => {
    listBackends.mockImplementation(async (installation: string) => [
      installation === 'gpu'
        ? kserve
        : modelManagerBackendSchema.parse({
            ...backendOllama,
            loading: {
              onDemand: true,
              idleEviction: true,
              keepAliveDefault: '5m',
              keepAliveScope: 'request',
            },
          }),
    ]);

    const { result } = renderSource(['lab', 'gpu']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The Ollama installation says how it loads; the KServe fixture predates
    // the block and says nothing.
    expect(result.current.loading).toEqual({
      lab: {
        onDemand: true,
        idleEviction: true,
        keepAliveDefault: '5m',
        keepAliveScope: 'request',
      },
    });
    // Ollama is a multi-model host; KServe predictors each have their own.
    expect(result.current.sharedHosts).toEqual({ lab: ['172.21.0.1:11434'] });
    // And its not-loaded models read as Idle, not Available.
    const notLoaded = result.current.servedModels.filter(
      model => model.installation === 'lab' && !model.loaded,
    );
    expect(notLoaded.length).toBeGreaterThan(0);
    expect(new Set(notLoaded.map(model => model.readiness))).toEqual(
      new Set(['idle']),
    );
  });

  it('stays silent when the configured list itself cannot be read (older backend)', async () => {
    listInstallations.mockRejectedValue(namedError('NotFoundError'));

    const { result } = renderSource();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual([]);
    expect(result.current.unreachableInstallations).toEqual([]);
  });

  it('maps each installation to its backend, capabilities and served models', async () => {
    const { result } = renderSource();

    await waitFor(() => expect(result.current.servedModels).toHaveLength(6));

    expect(result.current.installations).toEqual(['lab', 'gpu']);
    expect(result.current.backends).toEqual({ lab: 'ollama', gpu: 'kserve' });
    expect(result.current.capabilities?.lab).toMatchObject({
      pull: true,
      load: true,
      delete: true,
      wire: true,
      presets: false,
      nodeInventory: false,
    });
    expect(result.current.capabilities?.gpu).toMatchObject({
      presets: true,
      fitCheck: true,
      nodeInventory: true,
    });
    expect(
      result.current.servedModels.map(model => [
        model.installation,
        model.backend,
        model.name,
        model.readiness,
      ]),
    ).toEqual([
      ['lab', 'ollama', 'qwen3.5:9b', 'available'],
      ['lab', 'ollama', 'qwen3:0.6b', 'available'],
      ['lab', 'ollama', 'gemma3:270m', 'available'],
      // A served KServe model is named after its InferenceService; a cached
      // one after its repository, "downloaded on <node>".
      ['gpu', 'kserve', 'qwen3-14b', 'ready'],
      [
        'gpu',
        'kserve',
        'mistralai/Devstral-Small-2-24B-Instruct-2512',
        'available',
      ],
      ['gpu', 'kserve', 'hf-internal-testing/tiny-random-gpt2', 'available'],
    ]);
    // Only the backend with a node inventory is asked for its nodes.
    await waitFor(() => expect(result.current.gpuNodes).toHaveLength(1));
    expect(listNodes).toHaveBeenCalledTimes(1);
    expect(listNodes).toHaveBeenCalledWith('gpu');
    expect(result.current.gpuNodes[0]).toMatchObject({
      id: 'gpu/gpu-node-1',
      installation: 'gpu',
      name: 'gpu-node-1',
      product: 'NVIDIA-GB10',
      memoryBudgetBytes: 92417933312,
      memoryFreeBytes: 30140907520,
      cache: { claim: 'hf-cache', models: 3 },
    });
    expect(result.current.gpuCapacityUnavailable).toEqual({});
  });

  it('keeps the models and flags the panel when the node view cannot be read', async () => {
    listNodes.mockRejectedValue(
      namedError('ForbiddenError', 'nodes are not yours'),
    );
    const { result } = renderSource(['gpu']);

    await waitFor(() =>
      expect(result.current.gpuCapacityUnavailable).toEqual({
        gpu: 'forbidden',
      }),
    );
    expect(result.current.servedModels).toHaveLength(3);
    expect(result.current.gpuNodes).toEqual([]);
    expect(result.current.unreachableInstallations).toEqual([]);
  });

  it('surfaces an installation whose backend descriptor cannot be read', async () => {
    listBackends.mockImplementation(async (installation: string) => {
      if (installation === 'gpu') {
        throw namedError('UnauthorizedError', 'token rejected at the gateway');
      }
      return [ollama];
    });

    const { result } = renderSource();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual(['lab']);
    expect(result.current.unreachableInstallations).toEqual(['gpu']);
    // No inventory read for an installation whose descriptor failed.
    expect(listModels).not.toHaveBeenCalledWith('gpu');
  });

  it('keeps an installation whose inventory failed in view, marked unreadable', async () => {
    listModels.mockImplementation(async (installation: string) => {
      if (installation === 'lab') {
        throw namedError('ServiceUnavailableError', 'host Ollama is down');
      }
      return kserveModels;
    });

    const { result } = renderSource();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual(['lab', 'gpu']);
    expect(result.current.backends.lab).toBe('ollama');
    expect(result.current.unreachableInstallations).toEqual(['lab']);
    expect(
      result.current.servedModels.every(model => model.installation === 'gpu'),
    ).toBe(true);
  });

  it('skips an installation whose backend this portal does not know', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    listBackends.mockImplementation(async (installation: string) => [
      installation === 'gpu' ? { ...kserve, backend: 'triton' } : ollama,
    ]);

    const { result } = renderSource();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual(['lab']);
    expect(result.current.unreachableInstallations).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'triton'"));
    warn.mockRestore();
  });

  it('is loading until the configured list, descriptors and inventories answered', async () => {
    const { result } = renderSource();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.servedModels.length).toBeGreaterThan(0);
  });

  it('lists the host of an Ollama-backed model-manager that reports a node inventory, off the rows', async () => {
    // model-manager 0.7+: the Ollama driver reports its host as a node and
    // nodeInventory becomes true.
    const ollamaWithHost = modelManagerBackendSchema.parse({
      ...backendOllama,
      capabilities: { ...backendOllama.capabilities, nodeInventory: true },
    });
    const ollamaNodes = parseModelManagerList(
      nodesOllama,
      'nodes',
      modelManagerNodeSchema,
    );
    listBackends.mockImplementation(async (installation: string) => [
      installation === 'gpu' ? kserve : ollamaWithHost,
    ]);
    listNodes.mockImplementation(async (installation: string) =>
      installation === 'gpu' ? kserveNodes : ollamaNodes,
    );
    listModels.mockImplementation(async (installation: string) =>
      installation === 'gpu'
        ? kserveModels
        : [
            ollamaModels[0],
            {
              ...ollamaModels[1],
              loaded: true,
              running: {
                name: ollamaModels[1].name,
                sizeBytes: 5403658158,
                vramBytes: 5403658158,
                contextLength: 40960,
                expiresAt: '2026-09-02T13:05:00Z',
              },
            },
            ollamaModels[2],
          ],
    );

    const { result } = renderSource();

    await waitFor(() => expect(result.current.gpuNodes).toHaveLength(2));
    expect(listNodes).toHaveBeenCalledWith('lab');
    expect(result.current.capabilities?.lab.nodeInventory).toBe(true);
    expect(
      result.current.gpuNodes.find(node => node.installation === 'lab'),
    ).toMatchObject({
      // A backend host is one row per backend (a lab host may run Ollama and
      // Lemonade side by side): the backend is part of its id.
      id: 'lab/ollama/172.21.0.1',
      backend: 'ollama',
      name: '172.21.0.1',
      memoryBudgetSource: 'host-meminfo',
      memoryBudgetBytes: 92417933312,
      memoryReservedBytes: 5403658158,
      memoryFreeBytes: 87014275154,
      accelerated: true,
      product: undefined,
      labeledCount: undefined,
    });

    // The host is the capacity view's row, never the served rows' placement:
    // no Ollama row carries a node, so the Serving table keeps its Node and
    // GPUs columns off for them.
    const labRows = result.current.servedModels.filter(
      model => model.installation === 'lab',
    );
    expect(labRows).toHaveLength(3);
    expect(labRows.every(model => model.node === undefined)).toBe(true);
    expect(labRows.find(model => model.loaded)).toMatchObject({
      memoryBytes: 5403658158,
      memoryVramBytes: 5403658158,
    });
  });
});

describe('useModelManagerServingSource · several backends on one installation', () => {
  const lemonade = modelManagerBackendSchema.parse({
    backend: 'lemonade',
    version: '11.9.0',
    endpoint: 'http://172.21.0.1:13305',
    agentEndpoint: 'http://172.21.0.1:13305/api/v1',
    healthy: true,
    capabilities: {
      pull: true,
      pullProgress: true,
      delete: true,
      load: true,
      unload: true,
      loadedModels: true,
      wire: true,
      presets: false,
      fitCheck: false,
      nodeInventory: true,
      search: false,
    },
    loading: { onDemand: true, idleEviction: false },
  });
  const ollamaWithHost = modelManagerBackendSchema.parse({
    ...backendOllama,
    backends: ['ollama', 'lemonade'],
    capabilities: { ...backendOllama.capabilities, nodeInventory: true },
  });
  const lemonadeModel = modelManagerModelSchema.parse({
    name: 'qwen3-4b-FLM',
    backend: 'lemonade',
    runtime: 'flm',
    sizeBytes: 3_100_000_000,
    loaded: true,
    running: {
      name: 'qwen3-4b-FLM',
      backend: 'lemonade',
      sizeBytes: 3_100_000_000,
      device: 'npu',
      pinned: true,
    },
  });

  it('files every backend, its flags and its rows under the one installation', async () => {
    listInstallations.mockResolvedValue(['lab']);
    listBackends.mockResolvedValue([ollamaWithHost, lemonade]);
    listModels.mockResolvedValue([
      ...ollamaModels.map(model => ({ ...model, backend: 'ollama' })),
      lemonadeModel,
    ]);
    listNodes.mockResolvedValue(
      parseModelManagerList(
        {
          nodes: [
            { ...nodesOllama.nodes[0], backend: 'ollama' },
            {
              ...nodesOllama.nodes[0],
              backend: 'lemonade',
              budgetSource: 'system-info',
              gpuCount: 2,
              gpuProduct: 'AMD NPU (NPU Strix)',
            },
          ],
        },
        'nodes',
        modelManagerNodeSchema,
      ),
    );

    const { result } = renderSource(['lab']);
    await waitFor(() => expect(result.current.servedModels).toHaveLength(4));
    await waitFor(() => expect(result.current.gpuNodes).toHaveLength(2));

    // One read of each: the inventory and the nodes are aggregated by
    // model-manager, every entry naming its backend.
    expect(listBackends).toHaveBeenCalledWith('lab');
    expect(listModels).toHaveBeenCalledTimes(1);
    expect(listModels).toHaveBeenCalledWith('lab');
    expect(listNodes).toHaveBeenCalledTimes(1);

    // The installation's label is its default (first) backend; both have a say.
    expect(result.current.backends).toEqual({ lab: 'ollama' });
    expect(result.current.sourceBackends).toEqual({
      lab: ['ollama', 'lemonade'],
    });
    expect(result.current.backendCapabilities?.lab?.ollama?.nodeInventory).toBe(
      true,
    );
    expect(result.current.backendCapabilities?.lab?.lemonade?.search).toBe(
      false,
    );
    expect(result.current.backendLoading?.lab?.lemonade).toEqual({
      onDemand: true,
      idleEviction: false,
    });
    // Both host servers are shared by their models, each on its own port.
    expect(result.current.sharedHosts?.lab).toEqual(
      expect.arrayContaining(['172.21.0.1:11434', '172.21.0.1:13305']),
    );
    // Rows carry their own backend, and are rendered with its descriptor.
    const flm = result.current.servedModels.find(
      model => model.name === 'qwen3-4b-FLM',
    );
    expect(flm).toMatchObject({
      backend: 'lemonade',
      runtime: 'lemonade 11.9.0',
      engine: 'flm',
      device: 'npu',
      pinned: true,
      endpointHosts: ['172.21.0.1:13305'],
    });
    expect(
      result.current.servedModels.filter(model => model.backend === 'ollama'),
    ).toHaveLength(3);
    // One capacity row per backend host.
    expect(result.current.gpuNodes.map(node => node.id).sort()).toEqual([
      'lab/lemonade/172.21.0.1',
      'lab/ollama/172.21.0.1',
    ]);
  });
});

describe('useModelManagerServingSource · the persisted cache of an older portal', () => {
  beforeEach(() => {
    listInstallations.mockResolvedValue(['lab']);
    listBackends.mockResolvedValue([ollama]);
    listModels.mockResolvedValue(ollamaModels);
    listNodes.mockResolvedValue([]);
  });

  it('reads the backends list under its own key, next to the single descriptor an older portal persisted', async () => {
    // The plugin persists its query cache across releases. A portal before
    // this change stored ONE descriptor object under the `backend` key; the
    // list must live under a key of its own, or the object is rehydrated
    // where an array is iterated.
    const { result } = renderSource(['lab'], queryClient => {
      queryClient.setQueryData(modelManagerBackendQueryKey('lab'), ollama);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listBackends).toHaveBeenCalledWith('lab');
    expect(result.current.sourceBackends).toEqual({ lab: ['ollama'] });
    expect(result.current.servedModels.length).toBeGreaterThan(0);
  });

  it('treats a persisted entry of another shape under the list key as not answered yet', async () => {
    const { result } = renderSource(['lab'], queryClient => {
      // A corrupt or foreign store: an object where the list belongs.
      queryClient.setQueryData(modelManagerBackendsQueryKey('lab'), ollama, {
        updatedAt: Date.now(),
      });
    });
    // Fresh data is not refetched; the hook must still not throw and must
    // render the installation as pending rather than crash the page.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.installations).toEqual([]);
    expect(result.current.unreachableInstallations).toEqual([]);
  });
});
