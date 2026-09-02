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
import {
  modelManagerBackendSchema,
  modelManagerModelSchema,
  parseModelManagerList,
} from '../../lib/modelManager';
import { useModelManagerServingSource } from './useModelManagerServingSource';

const listInstallations = jest.fn();
const getBackend = jest.fn();
const listModels = jest.fn();

const modelManagerApi = {
  listInstallations,
  getBackend,
  listModels,
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
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
    expect(getBackend).not.toHaveBeenCalled();
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

    await waitFor(() => expect(result.current.servedModels).toHaveLength(5));

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
      ['gpu', 'kserve', 'Qwen/Qwen3-14B', 'ready'],
      ['gpu', 'kserve', 'mistralai/Devstral-Small-2', 'available'],
    ]);
    // The model-manager source never contributes GPU nodes; a backend with a
    // node inventory says so through its capability flag instead.
    expect(result.current.gpuNodes).toEqual([]);
    expect(result.current.gpuCapacityUnavailable).toEqual({});
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
});
