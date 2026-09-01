import { crds } from '@giantswarm/k8s-types';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  buildKeySecretManifest,
  buildKeySecretPatch,
  buildModelConfigManifest,
  buildModelConfigPatch,
  INITIAL_MODEL_CONFIG_FORM,
  keySecretName,
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
    metadata?: Partial<crds.kagent.v1alpha2.ModelConfig['metadata']>;
    spec?: crds.kagent.v1alpha2.ModelConfig['spec'];
  } = {},
): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: 'kagent', ...overrides.metadata },
      spec: overrides.spec ?? {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret: 'kagent-qwen3',
        apiKeySecretKey: 'OPENAI_API_KEY',
        openAI: { baseUrl: 'https://vllm.example.test/v1' },
      },
    } as crds.kagent.v1alpha2.ModelConfig,
    CLUSTER,
  );
}

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

describe('validateModelConfigForm', () => {
  it('accepts a complete OpenAI form', () => {
    expect(validateModelConfigForm(values())).toEqual([]);
  });

  it('requires a DNS-label name', () => {
    expect(validateModelConfigForm(values({ name: '' }))).toContainEqual(
      expect.stringContaining('Name is required'),
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

  it('requires a key on create unless the endpoint is keyless', () => {
    expect(validateModelConfigForm(values({ apiKey: '' }))).toContainEqual(
      expect.stringContaining('API key is required'),
    );
    expect(
      validateModelConfigForm(values({ apiKey: '', keyless: true })),
    ).toEqual([]);
  });

  it('accepts an empty key on edit while the provider is unchanged', () => {
    expect(
      validateModelConfigForm(values({ apiKey: '' }), {
        isEdit: true,
        originalProvider: 'OpenAI',
      }),
    ).toEqual([]);
  });

  it('requires a new key when the provider changes on edit', () => {
    // The existing Secret holds the old provider's canonical key, which the
    // portal cannot read back — so it cannot be carried over.
    const errors = validateModelConfigForm(
      values({ provider: 'Anthropic', apiKey: '' }),
      { isEdit: true, originalProvider: 'OpenAI' },
    );
    expect(errors).toContainEqual(expect.stringContaining('new API key'));

    expect(
      validateModelConfigForm(
        values({ provider: 'Anthropic', apiKey: 'sk-ant' }),
        { isEdit: true, originalProvider: 'OpenAI' },
      ),
    ).toEqual([]);
  });
});

describe('planKeySecret', () => {
  it('writes the canonical key on create', () => {
    expect(planKeySecret(values(), false)).toEqual({
      action: 'write',
      name: 'kagent-qwen3',
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
    });
  });

  it('writes a placeholder for keyless endpoints', () => {
    // The Secret must still exist: the kagent controller injects its key as an
    // env var and the ADK runtime requires that env var at startup.
    expect(planKeySecret(values({ apiKey: '', keyless: true }), false)).toEqual(
      {
        action: 'write',
        name: 'kagent-qwen3',
        key: 'OPENAI_API_KEY',
        value: PLACEHOLDER_API_KEY,
      },
    );
  });

  it('involves no secret for Ollama', () => {
    expect(
      planKeySecret(values({ provider: 'Ollama', apiKey: '' }), false),
    ).toEqual({ action: 'none' });
  });

  it('keeps the existing secret on edit when nothing new was entered', () => {
    expect(planKeySecret(values({ apiKey: '' }), true)).toEqual({
      action: 'keep',
    });
  });

  it('replaces the secret on edit when a new key was entered', () => {
    expect(planKeySecret(values({ apiKey: 'sk-new' }), true)).toEqual({
      action: 'write',
      name: 'kagent-qwen3',
      key: 'OPENAI_API_KEY',
      value: 'sk-new',
    });
  });

  it('maps each provider to its canonical env-var key', () => {
    const keyFor = (provider: ModelConfigFormValues['provider']) => {
      const plan = planKeySecret(values({ provider }), false);
      return plan.action === 'write' ? plan.key : undefined;
    };
    expect(keyFor('OpenAI')).toBe('OPENAI_API_KEY');
    expect(keyFor('Anthropic')).toBe('ANTHROPIC_API_KEY');
    expect(keyFor('Gemini')).toBe('GOOGLE_API_KEY');
  });
});

describe('buildKeySecretManifest', () => {
  it('creates an Opaque secret with the one canonical key, marked as ours', () => {
    const plan = planKeySecret(values(), false);
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
    const plan = planKeySecret(values({ provider: 'Anthropic' }), true);
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
      planKeySecret(form, false),
      'kagent',
    );

    expect(manifest).toEqual({
      apiVersion: 'kagent.dev/v1alpha2',
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

  it('omits what is not set: no annotation, endpoint block, secret or tls', () => {
    const form = values({
      provider: 'Gemini',
      apiKey: '',
      keyless: true,
      endpoint: '',
    });
    const manifest = buildModelConfigManifest(
      form,
      planKeySecret(form, false),
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
        buildModelConfigManifest(
          form,
          planKeySecret(form, false),
          'kagent',
        ) as {
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
    const form = values({ endpoint: 'https://new.example.test/v1' });
    const patch = buildModelConfigPatch(
      form,
      planKeySecret(form, true),
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
      planKeySecret(form, true),
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
      planKeySecret(form, true),
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
      planKeySecret(form, true),
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
      keyless: false,
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
