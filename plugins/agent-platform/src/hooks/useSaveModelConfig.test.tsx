import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ModelConfig,
  ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  INITIAL_MODEL_CONFIG_FORM,
  ModelConfigFormValues,
  PLACEHOLDER_API_KEY,
} from '../lib/modelConfigs';
import { useSaveModelConfig } from './useSaveModelConfig';

// The organizations agent-manager names for the person
// (`list_organizations`).
jest.mock('../components/OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../components/OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

// The composition helpers are the real ones (covered by modelConfigs.test.ts);
// only the write verbs are mocked, so what's under test here is the order and
// routing of the writes.
const mockCreateResource = jest.fn();
const mockPatchResource = jest.fn();
const mockDeleteResource = jest.fn();
const mockFetchResourceList = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  createResource: (...args: unknown[]) => mockCreateResource(...args),
  patchResource: (...args: unknown[]) => mockPatchResource(...args),
  deleteResource: (...args: unknown[]) => mockDeleteResource(...args),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

const MARK = 'agent-platform.giantswarm.io/is-default-model-config';

function listed(
  name: string,
  {
    marked = false,
    labels = {},
  }: { marked?: boolean; labels?: Record<string, string> } = {},
) {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: {
      name,
      namespace: 'kagent',
      labels,
      ...(marked ? { annotations: { [MARK]: 'true' } } : {}),
    },
    spec: { provider: 'OpenAI', model: 'x' },
  };
}

async function saveError(
  result: { current: ReturnType<typeof useSaveModelConfig> },
  input: Parameters<ReturnType<typeof useSaveModelConfig>['save']>[0],
): Promise<Error> {
  let error: Error | undefined;
  await act(async () => {
    try {
      await result.current.save(input);
    } catch (caught) {
      error = caught as Error;
    }
  });
  if (!error) {
    throw new Error('the save did not fail');
  }
  return error;
}

function createdManifest() {
  const call = mockCreateResource.mock.calls.find(
    ([options]) => options.gvk.plural === 'modelconfigs',
  );
  return call?.[0].manifest as {
    metadata: { annotations?: Record<string, string> };
  };
}

const CLUSTER = 'gazelle';

const analyticsApi = mockApis.analytics.mock();

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

function makeModelConfig(spec: ModelConfigInterface['spec']): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: 'kagent' },
      spec,
    } as ModelConfigInterface,
    CLUSTER,
  );
}

function setup() {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kubernetesApiRef, { proxy: jest.fn() }],
        [analyticsApiRef, analyticsApi],
      ]}
    >
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
  jest.mocked(analyticsApi.captureEvent).mockClear();
  mockCreateResource.mockReset();
  mockCreateResource.mockResolvedValue(undefined);
  mockPatchResource.mockReset();
  mockPatchResource.mockResolvedValue(undefined);
  mockDeleteResource.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
  mockFetchResourceList.mockReset();
  mockFetchResourceList.mockResolvedValue([]);
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
    // Reported without the model's name, provider or endpoint.
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.modelCreated',
        attributes: {},
      }),
    );
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
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.modelUpdated',
        attributes: {},
      }),
    );
  });

  it('rewrites the secret for a new provider when no key was entered', async () => {
    // The stored Secret holds the old provider's canonical key; with the key
    // field left empty, the endpoint is taken to need none and the Secret
    // gets the placeholder under the new provider's key.
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
        values: values({ provider: 'Anthropic', apiKey: '' }),
        original,
      });
    });

    expect(mockPatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'kagent-qwen3',
        patch: {
          data: null,
          stringData: { ANTHROPIC_API_KEY: PLACEHOLDER_API_KEY },
        },
      }),
    );
    expect(mockPatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        gvk: expect.objectContaining({ plural: 'modelconfigs' }),
        patch: expect.objectContaining({
          spec: expect.objectContaining({
            apiKeySecret: 'kagent-qwen3',
            apiKeySecretKey: 'ANTHROPIC_API_KEY',
          }),
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
          values: values({ apiKey: '' }),
        }),
      ).rejects.toThrow(/already exists/);
    });

    // The mutation's error state reaches React on a later tick than the
    // rejection does, so poll for it instead of asserting right away.
    await waitFor(() => expect(result.current.error).toBe(conflict));
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  describe('the default mark', () => {
    it('marks the first model of a namespace without a default', async () => {
      mockFetchResourceList.mockResolvedValue([listed('other')]);
      const { result } = setup();

      let saved: Awaited<ReturnType<typeof result.current.save>> | undefined;
      await act(async () => {
        saved = await result.current.save({
          installation: CLUSTER,
          values: values(),
        });
      });

      expect(saved).toEqual({ isDefault: true });

      expect(mockFetchResourceList).toHaveBeenCalledWith(
        expect.objectContaining({ cluster: CLUSTER, namespace: 'kagent' }),
      );
      expect(createdManifest().metadata.annotations).toEqual({
        [MARK]: 'true',
      });
    });

    it('marks the new model beside an unmarked default-model-config', async () => {
      mockFetchResourceList.mockResolvedValue([listed('default-model-config')]);
      const { result } = setup();

      let saved: Awaited<ReturnType<typeof result.current.save>> | undefined;
      await act(async () => {
        saved = await result.current.save({
          installation: CLUSTER,
          values: values(),
        });
      });

      expect(saved).toEqual({ isDefault: true });
      expect(createdManifest().metadata.annotations).toEqual({
        [MARK]: 'true',
      });
    });

    it('leaves a namespace with a default as it is', async () => {
      mockFetchResourceList.mockResolvedValue([
        listed('sonnet', { marked: true }),
      ]);
      const { result } = setup();

      await act(async () => {
        await result.current.save({ installation: CLUSTER, values: values() });
      });

      expect(createdManifest().metadata.annotations).toBeUndefined();
      expect(mockPatchResource).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'sonnet' }),
      );
    });

    it('moves the mark on request: on the new model, then off the old one', async () => {
      mockFetchResourceList.mockResolvedValue([
        listed('sonnet', { marked: true }),
      ]);
      const { result } = setup();

      await act(async () => {
        await result.current.save({
          installation: CLUSTER,
          values: values(),
          makeDefault: true,
          expectedMarks: ['sonnet'],
        });
      });

      expect(createdManifest().metadata.annotations).toEqual({
        [MARK]: 'true',
      });
      expect(mockPatchResource).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'sonnet',
          patch: { metadata: { annotations: { [MARK]: null } } },
        }),
      );
    });

    it('refuses a move when a mark it did not show appeared, writing nothing', async () => {
      mockFetchResourceList.mockResolvedValue([
        listed('sonnet', { marked: true }),
        listed('haiku', { marked: true }),
      ]);
      const { result } = setup();

      const error = await saveError(result, {
        installation: CLUSTER,
        values: values(),
        makeDefault: true,
        expectedMarks: ['sonnet'],
      });
      expect(error.message).toMatch(
        /haiku became the default while this page was open/,
      );
      expect(mockCreateResource).not.toHaveBeenCalled();
      expect(mockPatchResource).not.toHaveBeenCalled();
    });

    it('refuses to create when the namespace cannot be read', async () => {
      mockFetchResourceList.mockRejectedValue(new Error('forbidden'));
      const { result } = setup();

      const error = await saveError(result, {
        installation: CLUSTER,
        values: values(),
      });
      expect(error.message).toMatch(/Could not read the models of kagent/);
      expect(mockCreateResource).not.toHaveBeenCalled();
    });

    it('leaves the mark alone on an edit', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.save({
          installation: CLUSTER,
          values: values({ apiKey: '' }),
          original: makeModelConfig({
            provider: 'OpenAI',
            model: 'qwen3-8-27b',
            apiKeySecret: 'kagent-qwen3',
            apiKeySecretKey: 'OPENAI_API_KEY',
          }),
        });
      });

      expect(mockFetchResourceList).not.toHaveBeenCalled();
    });
  });

  describe('in an Organization namespace', () => {
    it('names the key Secret tenant-credential-<model> and sets no base URL', async () => {
      const notFound = new Error('no secret yet');
      notFound.name = 'NotFoundError';
      mockPatchResource.mockRejectedValueOnce(notFound);
      const { result } = setup();

      await act(async () => {
        await result.current.save({
          installation: CLUSTER,
          namespace: 'org-acme',
          values: values({
            provider: 'Anthropic',
            endpoint: 'https://api.example.com',
          }),
        });
      });

      const [secretCall, modelConfigCall] = mockCreateResource.mock.calls;
      expect(secretCall[0]).toMatchObject({
        namespace: 'org-acme',
        manifest: expect.objectContaining({
          metadata: expect.objectContaining({
            name: 'tenant-credential-qwen3',
          }),
        }),
      });
      expect(modelConfigCall[0].namespace).toBe('org-acme');
      expect(modelConfigCall[0].manifest.spec).toEqual({
        provider: 'Anthropic',
        model: 'qwen3-8-27b',
        apiKeySecret: 'tenant-credential-qwen3',
        apiKeySecretKey: 'ANTHROPIC_API_KEY',
      });
    });

    it('removes the Secret it created when admission refuses the model', async () => {
      const notFound = new Error('no secret yet');
      notFound.name = 'NotFoundError';
      mockPatchResource.mockRejectedValueOnce(notFound);
      mockCreateResource
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('provider OpenAI is not one of them'));
      const { result } = setup();

      const error = await saveError(result, {
        installation: CLUSTER,
        namespace: 'org-acme',
        values: values(),
      });
      expect(error.message).toMatch(/not one of them/);
      expect(mockDeleteResource).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tenant-credential-qwen3',
          namespace: 'org-acme',
        }),
      );
    });
  });
});
