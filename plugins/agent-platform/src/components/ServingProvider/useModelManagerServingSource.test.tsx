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

const listInstallations = jest.fn();
const getBackend = jest.fn();
const listModels = jest.fn();
const listNodes = jest.fn();

const modelManagerApi = {
  listInstallations,
  getBackend,
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

function renderSource(reachable = ['lab', 'gpu', 'plain']) {
  // Retries off so a rejected read settles immediately.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
  getBackend.mockReset();
  listModels.mockReset();
  listNodes.mockReset();
  listNodes.mockResolvedValue(kserveNodes);
  listInstallations.mockResolvedValue(['lab', 'gpu']);
  getBackend.mockImplementation(async (installation: string) =>
    installation === 'gpu' ? kserve : ollama,
  );
  listModels.mockImplementation(async (installation: string) =>
    installation === 'gpu' ? kserveModels : ollamaModels,
  );
});

describe('useModelManagerServingSource', () => {
  it('reads only the reachable installations the backend proxies a model-manager for', async () => {
    const { result } = renderSource(['lab', 'plain']);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getBackend).toHaveBeenCalledTimes(1);
    expect(getBackend).toHaveBeenCalledWith('lab');
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
      capabilities: {},
      loading: {},
      sharedHosts: {},
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
    expect(getBackend).not.toHaveBeenCalled();
  });

  it('reports how the backend loads and the host every model answers on, once the inventory is read', async () => {
    getBackend.mockImplementation(async (installation: string) =>
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
    );

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
    getBackend.mockImplementation(async (installation: string) => {
      if (installation === 'gpu') {
        throw namedError('UnauthorizedError', 'token rejected at the gateway');
      }
      return ollama;
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
    getBackend.mockImplementation(async (installation: string) =>
      installation === 'gpu' ? { ...kserve, backend: 'triton' } : ollama,
    );

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
    getBackend.mockImplementation(async (installation: string) =>
      installation === 'gpu' ? kserve : ollamaWithHost,
    );
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
      id: 'lab/172.21.0.1',
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
