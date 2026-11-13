import {
  ModelConfig,
  ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  INITIAL_MODEL_CONFIG_FORM,
  isListenerRouted,
  modelConfigFieldErrors,
  modelNameError,
  modelConfigFormChanged,
  modelConfigEditOwner,
  modelConfigFormValues,
  modelConfigOwner,
  ModelConfigFormValues,
  providersFor,
  serviceAccountKeyError,
  serviceAccountKeySummary,
  validateModelConfigForm,
} from './modelConfigs';
import { organizationDirectory } from './organizations';

// The organization agent-manager names `org-acme` as; the namespace's name
// says nothing.
const directory = organizationDirectory([
  { namespace: 'org-acme', organization: 'acme', parent: 'org-parent' },
]);

const CLUSTER = 'gazelle';

describe('modelNameError', () => {
  it.each(['a', 'a'.repeat(63), 'model-1'])('accepts %s', name =>
    expect(modelNameError(name, true)).toBeUndefined(),
  );
  it.each(['', ' ', 'a'.repeat(64), '-model', 'model-', 'Model', 'model.name'])(
    'rejects %s',
    name => expect(modelNameError(name, true)).toBeDefined(),
  );
});

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
    ...overrides,
  };
}

describe('validateModelConfigForm', () => {
  it('accepts a complete OpenAI form', () => {
    expect(validateModelConfigForm(values())).toEqual([]);
  });

  it('requires a DNS-label name', () => {
    expect(validateModelConfigForm(values({ name: '' }))).toContainEqual(
      expect.stringContaining('Enter a technical name.'),
    );
    expect(validateModelConfigForm(values({ name: 'Qwen_3' }))).toContainEqual(
      expect.stringContaining('lowercase'),
    );
  });

  it('requires the model id', () => {
    expect(validateModelConfigForm(values({ model: ' ' }))).toContainEqual(
      expect.stringContaining('Enter the model id.'),
    );
  });

  it('rejects a non-URL endpoint', () => {
    expect(
      validateModelConfigForm(values({ endpoint: 'vllm.example.test' })),
    ).toContainEqual(expect.stringContaining('http://'));
  });

  it('requires the display name on create only', () => {
    // The technical name is filled in from it on create; an existing model
    // made with kubectl may have none and stays saveable as it is.
    expect(
      modelConfigFieldErrors(values({ displayName: ' ' })).displayName,
    ).toBe('Enter a name for the model.');
    expect(
      modelConfigFieldErrors(values({ displayName: '' }), { isEdit: true }),
    ).toEqual({});
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
      noCredential: true,
      displayName: 'Qwen 3',
      provider: 'OpenAI',
      model: 'qwen3-8-27b',
      endpoint: 'https://vllm.example.test/v1',
      projectID: '',
      location: '',
      insecureSkipTlsVerify: true,
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
    const initial = values({});
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

describe("an Organization's model", () => {
  it('asks for the name itself, with no display name', () => {
    expect(
      modelConfigFieldErrors(values({ displayName: '', name: '' }), {
        isEdit: false,
        routed: true,
      }),
    ).toEqual({ name: 'Enter a name for the model.' });
  });

  it('is edited through agent-manager when agent-manager wrote it', () => {
    const written = (namespace: string) =>
      makeModelConfig({
        metadata: {
          namespace,
          labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
        },
      });
    expect(modelConfigEditOwner(written('org-acme'), directory)).toBe(
      undefined,
    );
    expect(modelConfigEditOwner(written('kagent'), directory)).toBe(undefined);
  });

  it('goes through the listener in org-* namespaces only', () => {
    expect(isListenerRouted('org-acme', directory)).toBe(true);
    expect(isListenerRouted('kagent', directory)).toBe(false);
    expect(isListenerRouted('org-', directory)).toBe(false);
  });

  it('is offered the providers the listener can serve', () => {
    expect(providersFor('org-acme', directory)).toEqual([
      'Anthropic',
      'OpenAI',
      'AnthropicVertexAI',
      'GeminiVertexAI',
    ]);
    expect(providersFor('kagent', directory)).toContain('AnthropicVertexAI');
  });
});

describe('the default mark on create', () => {});

describe('Vertex AI', () => {
  function serviceAccountKey(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      type: 'service_account',
      project_id: 'my-project-123',
      private_key_id: 'abc',
      private_key: 'not-a-key',
      client_email: 'kagent@my-project-123.iam.gserviceaccount.com',
      token_uri: 'https://oauth2.googleapis.com/token',
      ...overrides,
    });
  }

  function vertex(
    overrides: Partial<ModelConfigFormValues> = {},
  ): ModelConfigFormValues {
    return values({
      provider: 'AnthropicVertexAI',
      name: 'sonnet-vertex',
      model: 'claude-sonnet-4-5@20250929',
      projectID: 'my-project-123',
      location: 'europe-west4',
      ...overrides,
    });
  }

  describe('serviceAccountKeyError', () => {
    it('accepts a service account key of the project', () => {
      expect(
        serviceAccountKeyError(serviceAccountKey(), 'my-project-123'),
      ).toBeUndefined();
    });

    it('accepts a key without token_uri, as kagent does', () => {
      expect(
        serviceAccountKeyError(
          serviceAccountKey({ token_uri: undefined }),
          'my-project-123',
        ),
      ).toBeUndefined();
    });

    it.each([
      ['not JSON', 'sk-ant-123', 'This file is not a JSON key'],
      ['a JSON array', '[]', 'This file is not a JSON key'],
      [
        'another kind of credential',
        serviceAccountKey({ type: 'authorized_user' }),
        'This file is not a service account key',
      ],
      [
        'a key of another project',
        serviceAccountKey({ project_id: 'other-project' }),
        'This key belongs to project other-project, not my-project-123',
      ],
      [
        'a key naming no project',
        serviceAccountKey({ project_id: undefined }),
        'This key names no project',
      ],
      [
        'a token endpoint other than Google’s',
        serviceAccountKey({ token_uri: 'https://evil.example.com/token' }),
        'https://oauth2.googleapis.com',
      ],
      [
        'Google’s token endpoint over plain HTTP',
        serviceAccountKey({ token_uri: 'http://oauth2.googleapis.com/token' }),
        'https://oauth2.googleapis.com',
      ],
    ])('rejects %s', (_, raw, message) => {
      expect(serviceAccountKeyError(raw, 'my-project-123')).toContain(message);
    });

    it('skips the project check while the project is unknown', () => {
      expect(
        serviceAccountKeyError(
          serviceAccountKey({ project_id: 'other-project' }),
          '',
        ),
      ).toBeUndefined();
    });
  });

  describe('serviceAccountKeySummary', () => {
    it('names the project and the account, nothing secret', () => {
      expect(serviceAccountKeySummary(serviceAccountKey())).toEqual({
        projectID: 'my-project-123',
        clientEmail: 'kagent@my-project-123.iam.gserviceaccount.com',
      });
    });

    it.each(['sk-ant-123', '[]', 'null'])('reads nothing from %s', raw => {
      expect(serviceAccountKeySummary(raw)).toBeUndefined();
    });
  });

  describe('modelConfigFieldErrors', () => {
    it('accepts a complete form', () => {
      expect(modelConfigFieldErrors(vertex())).toEqual({});
    });

    it.each(['global', 'us', 'eu', 'europe-west4', 'us-central1'])(
      'accepts the location %s',
      location => {
        expect(modelConfigFieldErrors(vertex({ location })).location).toBe(
          undefined,
        );
      },
    );

    it.each(['Europe', 'europe-west4-a', 'europe west4'])(
      'rejects the location %s',
      location => {
        expect(modelConfigFieldErrors(vertex({ location })).location).toMatch(
          /^Enter global, us, eu or a region/,
        );
      },
    );

    it('keeps the stored key on an edit of the same project', () => {
      const original = vertex({});
      expect(
        modelConfigFieldErrors(
          vertex({
            location: 'global',
            provider: 'GeminiVertexAI',
          }),
          { isEdit: true, original },
        ),
      ).toEqual({});
    });
  });

  it('prefills the form from the CR, and offers no edit for unsupported ones', () => {
    const modelConfig = makeModelConfig({
      spec: {
        provider: 'GeminiVertexAI',
        model: 'gemini-2.5-pro',
        apiKeySecret: 'kagent-qwen3',
        apiKeySecretKey: 'GOOGLE_APPLICATION_CREDENTIALS',
        geminiVertexAI: { projectID: 'my-project-123', location: 'us' },
      },
    });
    expect(modelConfigFormValues(modelConfig)).toMatchObject({
      provider: 'GeminiVertexAI',
      projectID: 'my-project-123',
      location: 'us',
      endpoint: '',
    });
  });

  it('counts a project or location edit as a change', () => {
    const initial = vertex({});
    expect(modelConfigFormChanged(initial, initial)).toBe(false);
    expect(
      modelConfigFormChanged({ ...initial, location: 'global' }, initial),
    ).toBe(true);
    expect(
      modelConfigFormChanged({ ...initial, projectID: 'new-project' }, initial),
    ).toBe(true);
  });
});
