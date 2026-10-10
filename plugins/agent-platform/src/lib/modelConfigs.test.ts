import {
  ModelConfig,
  ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  buildKeySecretManifest,
  buildKeySecretPatch,
  buildModelConfigManifest,
  buildModelConfigPatch,
  INITIAL_MODEL_CONFIG_FORM,
  keySecretName,
  modelConfigFieldErrors,
  modelConfigFormChanged,
  modelConfigFormValues,
  modelConfigOwner,
  ModelConfigFormValues,
  PLACEHOLDER_API_KEY,
  planKeySecret,
  validateModelConfigForm,
} from './modelConfigs';

const CLUSTER = 'gazelle';

function makeModelConfig(
  overrides: {
    metadata?: Partial<ModelConfigInterface['metadata']>;
    spec?: ModelConfigInterface['spec'];
  } = {},
): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: 'kagent', ...overrides.metadata },
      spec: overrides.spec ?? {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret: 'kagent-qwen3',
        apiKeySecretKey: 'OPENAI_API_KEY',
        openAI: { baseUrl: 'https://vllm.example.test/v1' },
      },
    } as ModelConfigInterface,
    CLUSTER,
  );
}

function values(
  overrides: Partial<ModelConfigFormValues> = {},
): ModelConfigFormValues {
  return {
    ...INITIAL_MODEL_CONFIG_FORM,
    displayName: 'Qwen 3',
    name: 'qwen3',
    model: 'qwen3-8-27b',
    apiKey: 'sk-test',
    ...overrides,
  };
}

describe('validateModelConfigForm', () => {
  it('accepts a complete OpenAI form', () => {
    expect(validateModelConfigForm(values())).toEqual([]);
  });

  it('requires a DNS-label name', () => {
    expect(validateModelConfigForm(values({ name: '' }))).toContainEqual(
      expect.stringContaining('Technical name is required'),
    );
    expect(validateModelConfigForm(values({ name: 'Qwen_3' }))).toContainEqual(
      expect.stringContaining('lowercase'),
    );
  });

  it('requires the model id', () => {
    expect(validateModelConfigForm(values({ model: ' ' }))).toContainEqual(
      expect.stringContaining('Model is required'),
    );
  });

  it('requires a host for Ollama and accepts it keyless without a key', () => {
    const ollama = values({ provider: 'Ollama', apiKey: '', endpoint: '' });
    expect(validateModelConfigForm(ollama)).toEqual([
      'Host is required for Ollama',
    ]);
    expect(
      validateModelConfigForm(
        values({
          provider: 'Ollama',
          apiKey: '',
          endpoint: 'http://ollama.ollama:11434',
        }),
      ),
    ).toEqual([]);
  });

  it('rejects a non-URL endpoint', () => {
    expect(
      validateModelConfigForm(values({ endpoint: 'vllm.example.test' })),
    ).toContainEqual(expect.stringContaining('http://'));
  });

  it('never requires the API key: empty means the endpoint needs none', () => {
    expect(validateModelConfigForm(values({ apiKey: '' }))).toEqual([]);
    expect(
      validateModelConfigForm(values({ provider: 'Anthropic', apiKey: '' }), {
        isEdit: true,
      }),
    ).toEqual([]);
  });

  it('requires the display name on create only', () => {
    // The technical name is filled in from it on create; an existing model
    // made with kubectl may have none and stays saveable as it is.
    expect(
      modelConfigFieldErrors(values({ displayName: ' ' })).displayName,
    ).toBe('Display name is required');
    expect(
      modelConfigFieldErrors(values({ displayName: '' }), { isEdit: true }),
    ).toEqual({});
  });
});

describe('planKeySecret', () => {
  const edit = (originalProvider = 'OpenAI') => ({
    isEdit: true,
    originalProvider,
  });

  it('writes the canonical key on create', () => {
    expect(planKeySecret(values())).toEqual({
      action: 'write',
      name: 'kagent-qwen3',
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
    });
  });

  it('writes a placeholder when no key is entered on create', () => {
    // An empty key means the endpoint needs none. The Secret must still
    // exist: the kagent controller injects its key as an env var and the ADK
    // runtime requires that env var at startup.
    expect(planKeySecret(values({ apiKey: '' }))).toEqual({
      action: 'write',
      name: 'kagent-qwen3',
      key: 'OPENAI_API_KEY',
      value: PLACEHOLDER_API_KEY,
    });
    // Whitespace is no key either; around a real one it is trimmed.
    expect(planKeySecret(values({ apiKey: '  \n' }))).toMatchObject({
      value: PLACEHOLDER_API_KEY,
    });
    expect(planKeySecret(values({ apiKey: ' sk-test\n' }))).toMatchObject({
      value: 'sk-test',
    });
  });

  it('involves no secret for Ollama', () => {
    expect(planKeySecret(values({ provider: 'Ollama', apiKey: '' }))).toEqual({
      action: 'none',
    });
  });

  it('keeps the existing secret on edit when nothing new was entered', () => {
    expect(planKeySecret(values({ apiKey: '' }), edit())).toEqual({
      action: 'keep',
    });
  });

  it('replaces the secret on edit when a new key was entered', () => {
    expect(planKeySecret(values({ apiKey: 'sk-new' }), edit())).toEqual({
      action: 'write',
      name: 'kagent-qwen3',
      key: 'OPENAI_API_KEY',
      value: 'sk-new',
    });
  });

  it('writes a placeholder when the provider changes on edit with no key entered', () => {
    // The stored Secret holds the old provider's canonical key, which the new
    // provider's runtime does not read and the portal cannot carry over — so
    // an empty field means the new endpoint needs none.
    expect(
      planKeySecret(values({ provider: 'Anthropic', apiKey: '' }), edit()),
    ).toEqual({
      action: 'write',
      name: 'kagent-qwen3',
      key: 'ANTHROPIC_API_KEY',
      value: PLACEHOLDER_API_KEY,
    });
    expect(
      planKeySecret(
        values({ provider: 'Anthropic', apiKey: 'sk-ant' }),
        edit(),
      ),
    ).toMatchObject({ value: 'sk-ant' });
  });

  it('maps each provider to its canonical env-var key', () => {
    const keyFor = (provider: ModelConfigFormValues['provider']) => {
      const plan = planKeySecret(values({ provider }));
      return plan.action === 'write' ? plan.key : undefined;
    };
    expect(keyFor('OpenAI')).toBe('OPENAI_API_KEY');
    expect(keyFor('Anthropic')).toBe('ANTHROPIC_API_KEY');
    expect(keyFor('Gemini')).toBe('GOOGLE_API_KEY');
  });
});

describe('buildKeySecretManifest', () => {
  it('creates an Opaque secret with the one canonical key, marked as ours', () => {
    const plan = planKeySecret(values());
    expect(plan.action).toBe('write');
    expect(
      buildKeySecretManifest(
        plan as Extract<typeof plan, { action: 'write' }>,
        'kagent',
      ),
    ).toEqual({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'kagent-qwen3',
        namespace: 'kagent',
        labels: { 'app.kubernetes.io/managed-by': 'giantswarm-backstage' },
      },
      type: 'Opaque',
      stringData: { OPENAI_API_KEY: 'sk-test' },
    });
  });
});

describe('buildKeySecretPatch', () => {
  it('clears previous keys before setting the new one', () => {
    // A provider switch must not leave the old provider's canonical key next
    // to the new one; `data: null` wipes the slate in one merge patch.
    const plan = planKeySecret(values({ provider: 'Anthropic' }), {
      isEdit: true,
      originalProvider: 'OpenAI',
    });
    expect(plan.action).toBe('write');
    expect(
      buildKeySecretPatch(plan as Extract<typeof plan, { action: 'write' }>),
    ).toEqual({
      data: null,
      stringData: { ANTHROPIC_API_KEY: 'sk-test' },
    });
  });
});

describe('buildModelConfigManifest', () => {
  it('composes an OpenAI-compatible config with endpoint, key and TLS skip', () => {
    const form = values({
      displayName: 'Qwen 3 (lab vLLM)',
      endpoint: 'https://vllm.example.test/v1',
      insecureSkipTlsVerify: true,
    });
    const manifest = buildModelConfigManifest(
      form,
      planKeySecret(form),
      'kagent',
    );

    expect(manifest).toEqual({
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: 'qwen3',
        namespace: 'kagent',
        labels: { 'app.kubernetes.io/managed-by': 'giantswarm-backstage' },
        annotations: { 'ui.giantswarm.io/display-name': 'Qwen 3 (lab vLLM)' },
      },
      spec: {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret: 'kagent-qwen3',
        apiKeySecretKey: 'OPENAI_API_KEY',
        openAI: { baseUrl: 'https://vllm.example.test/v1' },
        tls: { disableVerify: true },
      },
    });
  });

  it('omits what is not set: no annotation, endpoint block or tls', () => {
    // No key entered: the spec is the same as with one — it references the
    // Secret, which holds the placeholder.
    const form = values({
      provider: 'Gemini',
      displayName: '',
      apiKey: '',
      endpoint: '',
    });
    const manifest = buildModelConfigManifest(
      form,
      planKeySecret(form),
      'kagent',
    ) as { metadata: Record<string, unknown>; spec: Record<string, unknown> };

    expect(manifest.metadata.annotations).toBeUndefined();
    expect(manifest.spec).toEqual({
      provider: 'Gemini',
      model: 'qwen3-8-27b',
      apiKeySecret: 'kagent-qwen3',
      apiKeySecretKey: 'GOOGLE_API_KEY',
    });
  });

  it('puts the endpoint in the provider-specific block', () => {
    const spec = (form: ModelConfigFormValues) =>
      (
        buildModelConfigManifest(form, planKeySecret(form), 'kagent') as {
          spec: Record<string, unknown>;
        }
      ).spec;

    expect(
      spec(values({ provider: 'Anthropic', endpoint: 'https://a.test' })),
    ).toMatchObject({ anthropic: { baseUrl: 'https://a.test' } });
    expect(
      spec(
        values({ provider: 'Ollama', apiKey: '', endpoint: 'http://o.test' }),
      ),
    ).toMatchObject({ ollama: { host: 'http://o.test' } });
  });
});

describe('buildModelConfigPatch', () => {
  it('nulls the other providers’ blocks but writes only the managed field of the current one', () => {
    const form = values({
      displayName: '',
      endpoint: 'https://new.example.test/v1',
    });
    const patch = buildModelConfigPatch(
      form,
      planKeySecret(form, { isEdit: true, originalProvider: 'OpenAI' }),
      makeModelConfig(),
    );

    expect(patch).toEqual({
      metadata: {
        annotations: { 'ui.giantswarm.io/display-name': null },
      },
      spec: {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret: 'kagent-qwen3',
        apiKeySecretKey: 'OPENAI_API_KEY',
        openAI: { baseUrl: 'https://new.example.test/v1' },
        anthropic: null,
        ollama: null,
        tls: { disableVerify: null },
      },
    });
  });

  it('keeps a foreign secret reference when the plan is keep', () => {
    // The CR may reference a hand-provisioned Secret under any name; leaving
    // the key field empty must not repoint it to the portal convention.
    const original = makeModelConfig({
      spec: {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret: 'my-shared-key',
        apiKeySecretKey: 'OPENAI_API_KEY',
      },
    });
    const form = values({ apiKey: '' });
    const patch = buildModelConfigPatch(
      form,
      planKeySecret(form, { isEdit: true, originalProvider: 'OpenAI' }),
      original,
    ) as { spec: Record<string, unknown> };

    expect(patch.spec.apiKeySecret).toBe('my-shared-key');
  });

  it('drops the secret reference when switching to Ollama', () => {
    const form = values({
      provider: 'Ollama',
      apiKey: '',
      endpoint: 'http://ollama.ollama:11434',
    });
    const patch = buildModelConfigPatch(
      form,
      planKeySecret(form, { isEdit: true, originalProvider: 'OpenAI' }),
      makeModelConfig(),
    ) as { spec: Record<string, unknown> };

    expect(patch.spec).toMatchObject({
      apiKeySecret: null,
      apiKeySecretKey: null,
      ollama: { host: 'http://ollama.ollama:11434' },
      openAI: null,
    });
  });

  it('clears only the managed baseUrl when the endpoint is emptied', () => {
    // A hand-set openAI.maxTokens must survive the portal clearing the URL.
    const form = values({ endpoint: '' });
    const patch = buildModelConfigPatch(
      form,
      planKeySecret(form, { isEdit: true, originalProvider: 'OpenAI' }),
      makeModelConfig(),
    ) as { spec: Record<string, unknown> };

    expect(patch.spec.openAI).toEqual({ baseUrl: null });
  });
});

describe('modelConfigFormValues', () => {
  it('prefills from an existing CR with the key always blank', () => {
    expect(
      modelConfigFormValues(
        makeModelConfig({
          metadata: {
            name: 'qwen3',
            namespace: 'kagent',
            annotations: { 'ui.giantswarm.io/display-name': 'Qwen 3' },
          },
          spec: {
            provider: 'OpenAI',
            model: 'qwen3-8-27b',
            openAI: { baseUrl: 'https://vllm.example.test/v1' },
            tls: { disableVerify: true },
          },
        }),
      ),
    ).toEqual({
      name: 'qwen3',
      displayName: 'Qwen 3',
      provider: 'OpenAI',
      model: 'qwen3-8-27b',
      endpoint: 'https://vllm.example.test/v1',
      insecureSkipTlsVerify: true,
      apiKey: '',
    });
  });

  it('returns undefined for providers the form does not speak', () => {
    expect(
      modelConfigFormValues(
        makeModelConfig({
          spec: { provider: 'Bedrock', model: 'claude-sonnet' },
        }),
      ),
    ).toBeUndefined();
  });
});

describe('modelConfigFormChanged', () => {
  it('sees a changed field or an entered key, nothing else', () => {
    const initial = values({ apiKey: '' });
    expect(modelConfigFormChanged({ ...initial }, initial)).toBe(false);
    // Whitespace around a value is not a change.
    expect(
      modelConfigFormChanged({ ...initial, model: ' qwen3-8-27b ' }, initial),
    ).toBe(false);
    expect(
      modelConfigFormChanged({ ...initial, model: 'qwen3-32b' }, initial),
    ).toBe(true);
    expect(
      modelConfigFormChanged(
        { ...initial, insecureSkipTlsVerify: true },
        initial,
      ),
    ).toBe(true);
    expect(modelConfigFormChanged({ ...initial, apiKey: 'sk' }, initial)).toBe(
      true,
    );
  });
});

describe('modelConfigOwner', () => {
  it.each([
    [
      'Helm-rendered (chart default)',
      { 'app.kubernetes.io/managed-by': 'Helm' },
      'Helm',
    ],
    [
      'Flux HelmRelease-rendered',
      { 'helm.toolkit.fluxcd.io/name': 'agent-platform' },
      'Helm',
    ],
    [
      'Flux Kustomization-applied',
      { 'kustomize.toolkit.fluxcd.io/name': 'models' },
      'Flux',
    ],
    [
      'agentlab-owned',
      { 'app.kubernetes.io/managed-by': 'agentlab' },
      'agentlab',
    ],
  ])('%s is tool-owned', (_case, labels, owner) => {
    expect(modelConfigOwner(makeModelConfig({ metadata: { labels } }))).toBe(
      owner,
    );
  });

  it('treats portal-created and hand-applied CRs as writable', () => {
    expect(
      modelConfigOwner(
        makeModelConfig({
          metadata: {
            labels: { 'app.kubernetes.io/managed-by': 'giantswarm-backstage' },
          },
        }),
      ),
    ).toBeUndefined();
    expect(modelConfigOwner(makeModelConfig())).toBeUndefined();
  });
});

describe('keySecretName', () => {
  it('follows the agentlab convention', () => {
    expect(keySecretName('qwen3')).toBe('kagent-qwen3');
  });
});
