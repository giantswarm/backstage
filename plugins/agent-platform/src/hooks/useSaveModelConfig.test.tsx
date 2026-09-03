import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { crds } from '@giantswarm/k8s-types';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  INITIAL_MODEL_CONFIG_FORM,
  ModelConfigFormValues,
} from '../lib/modelConfigs';
import { useSaveModelConfig } from './useSaveModelConfig';

// The composition helpers are the real ones (covered by modelConfigs.test.ts);
// only the write verbs are mocked, so what's under test here is the order and
// routing of the writes.
const mockCreateResource = jest.fn();
const mockPatchResource = jest.fn();
const mockDeleteResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  createResource: (...args: unknown[]) => mockCreateResource(...args),
  patchResource: (...args: unknown[]) => mockPatchResource(...args),
  deleteResource: (...args: unknown[]) => mockDeleteResource(...args),
}));

const CLUSTER = 'gazelle';

function values(
  overrides: Partial<ModelConfigFormValues> = {},
): ModelConfigFormValues {
  return {
    ...INITIAL_MODEL_CONFIG_FORM,
    name: 'qwen3',
    model: 'qwen3-8-27b',
    apiKey: 'sk-test',
    ...overrides,
  };
}

function makeModelConfig(
  spec: crds.kagent.v1alpha2.ModelConfig['spec'],
): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: 'kagent' },
      spec,
    } as crds.kagent.v1alpha2.ModelConfig,
    CLUSTER,
  );
}

function setup() {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, { proxy: jest.fn() }]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </TestApiProvider>
  );

  return renderHook(() => useSaveModelConfig(), { wrapper });
}

beforeEach(() => {
  mockCreateResource.mockReset();
  mockCreateResource.mockResolvedValue(undefined);
  mockPatchResource.mockReset();
  mockPatchResource.mockResolvedValue(undefined);
  mockDeleteResource.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
});

describe('useSaveModelConfig', () => {
  it('creates the key secret before the ModelConfig', async () => {
    // The controller hashes the referenced Secret into the ModelConfig status,
    // so the reference should resolve on its first look. The secret write is
    // patch-then-create: patch answers 404 when no Secret exists yet.
    const notFound = new Error('no secret yet');
    notFound.name = 'NotFoundError';
    mockPatchResource.mockRejectedValueOnce(notFound);

    const { result } = setup();

    await act(async () => {
      await result.current.save({
        installation: CLUSTER,
        values: values(),
      });
    });

    // 1: patch secret (404) → 2: create secret → 3: create ModelConfig.
    expect(mockPatchResource).toHaveBeenCalledTimes(1);
    expect(mockCreateResource).toHaveBeenCalledTimes(2);

    const [secretCall, modelConfigCall] = mockCreateResource.mock.calls;
    expect(secretCall[0]).toMatchObject({
      namespace: 'kagent',
      gvk: expect.objectContaining({ plural: 'secrets', isCore: true }),
      manifest: expect.objectContaining({
        stringData: { OPENAI_API_KEY: 'sk-test' },
      }),
    });
    expect(modelConfigCall[0]).toMatchObject({
      namespace: 'kagent',
      gvk: expect.objectContaining({ plural: 'modelconfigs' }),
      manifest: expect.objectContaining({
        spec: expect.objectContaining({
          apiKeySecret: 'kagent-qwen3',
          apiKeySecretKey: 'OPENAI_API_KEY',
        }),
      }),
    });
    expect(secretCall).toBeDefined();
  });

  it('replaces an existing secret in place', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.save({
        installation: CLUSTER,
        values: values(),
      });
    });

    expect(mockPatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'kagent-qwen3',
        patch: { data: null, stringData: { OPENAI_API_KEY: 'sk-test' } },
      }),
    );
  });

  it('creates an Ollama model without any secret write', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.save({
        installation: CLUSTER,
        values: values({
          provider: 'Ollama',
          apiKey: '',
          endpoint: 'http://ollama.ollama:11434',
        }),
      });
    });

    expect(mockPatchResource).not.toHaveBeenCalled();
    expect(mockCreateResource).toHaveBeenCalledTimes(1);
    expect(mockCreateResource.mock.calls[0][0].gvk.plural).toBe('modelconfigs');
  });

  it('patches on edit and leaves an untouched key alone', async () => {
    const original = makeModelConfig({
      provider: 'OpenAI',
      model: 'qwen3-8-27b',
      apiKeySecret: 'kagent-qwen3',
      apiKeySecretKey: 'OPENAI_API_KEY',
    });

    const { result } = setup();

    await act(async () => {
      await result.current.save({
        installation: CLUSTER,
        values: values({ apiKey: '', model: 'qwen3-32b' }),
        original,
      });
    });

    expect(mockCreateResource).not.toHaveBeenCalled();
    expect(mockPatchResource).toHaveBeenCalledTimes(1);
    expect(mockPatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'qwen3',
        namespace: 'kagent',
        gvk: expect.objectContaining({ plural: 'modelconfigs' }),
        patch: expect.objectContaining({
          spec: expect.objectContaining({ model: 'qwen3-32b' }),
        }),
      }),
    );
  });

  it('drops our conventional secret when a model goes keyless', async () => {
    const original = makeModelConfig({
      provider: 'OpenAI',
      model: 'qwen3-8-27b',
      apiKeySecret: 'kagent-qwen3',
      apiKeySecretKey: 'OPENAI_API_KEY',
    });

    const { result } = setup();

    await act(async () => {
      await result.current.save({
        installation: CLUSTER,
        values: values({
          provider: 'Ollama',
          apiKey: '',
          endpoint: 'http://ollama.ollama:11434',
        }),
        original,
      });
    });

    expect(mockDeleteResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'kagent-qwen3',
        gvk: expect.objectContaining({ plural: 'secrets' }),
      }),
    );
  });

  it('keeps a foreign secret when a model goes keyless', async () => {
    const original = makeModelConfig({
      provider: 'OpenAI',
      model: 'qwen3-8-27b',
      apiKeySecret: 'my-shared-key',
      apiKeySecretKey: 'OPENAI_API_KEY',
    });

    const { result } = setup();

    await act(async () => {
      await result.current.save({
        installation: CLUSTER,
        values: values({
          provider: 'Ollama',
          apiKey: '',
          endpoint: 'http://ollama.ollama:11434',
        }),
        original,
      });
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('surfaces a name collision from the apiserver', async () => {
    const conflict = new Error('modelconfigs "qwen3" already exists');
    conflict.name = 'ConflictError';
    mockCreateResource.mockImplementation(async ({ gvk }: any) => {
      if (gvk.plural === 'modelconfigs') {
        throw conflict;
      }
    });

    const { result } = setup();

    await act(async () => {
      await expect(
        result.current.save({
          installation: CLUSTER,
          values: values({ keyless: true, apiKey: '' }),
        }),
      ).rejects.toThrow(/already exists/);
    });

    // The mutation's error state reaches React on a later tick than the
    // rejection does, so poll for it instead of asserting right away.
    await waitFor(() => expect(result.current.error).toBe(conflict));
  });
});
