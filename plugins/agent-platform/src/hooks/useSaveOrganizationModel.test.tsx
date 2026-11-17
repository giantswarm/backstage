/* eslint-disable @backstage/no-mixed-plugin-imports -- The Agent Platform composes installation APIs across plugins. */
import { useState } from 'react';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  musterApiRef,
  MusterUnauthorizedError,
} from '@giantswarm/backstage-plugin-muster';

import { CREDENTIAL_OPERATION } from '../lib/__fixtures__/agentManagerOrganizations';
import { AgentManagerError } from '../lib/agentManager';
import { INITIAL_MODEL_CONFIG_FORM } from '../lib/modelConfigs';
import { organizationsRouteRef, modelsRouteRef } from '../routes';
import {
  type SaveOrganizationModelInput,
  useSaveOrganizationModel,
} from './useSaveOrganizationModel';

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

const VALUES = {
  ...INITIAL_MODEL_CONFIG_FORM,
  name: 'claude-sonnet',
  provider: 'Anthropic' as const,
  model: 'claude-sonnet-4-6',
};

const SONNET = new ModelConfig(
  {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: { name: 'claude-sonnet', namespace: PAYMENTS.namespace },
    spec: {
      provider: 'Anthropic',
      model: 'claude-sonnet-4-5',
      apiKeySecret: 'tenant-credential-claude-sonnet',
      apiKeySecretKey: 'apiKey',
    },
  } as ModelConfigInterface,
  'gazelle',
);

/** The edit form's values of {@link SONNET} as it is stored: no caching. */
const SONNET_AS_STORED = {
  ...VALUES,
  model: 'claude-sonnet-4-5',
  promptCaching: false,
};

const analyticsApi = mockApis.analytics.mock();

/** Why the organization directory cannot answer for gazelle, when it cannot. */
let mockDirectoryFailure: string | undefined;
jest.mock('../components/OrganizationDirectoryProvider', () => {
  const actual = jest.requireActual(
    '../components/OrganizationDirectoryProvider',
  );
  return {
    ...actual,
    useOrganizationDirectory: () => {
      const value = actual.useOrganizationDirectory();
      return mockDirectoryFailure
        ? { ...value, failureOf: () => mockDirectoryFailure }
        : value;
    },
  };
});

/** Saves `input` on a click, and shows what the save answered. */
function Harness({ input }: { input: SaveOrganizationModelInput }) {
  const { save, error } = useSaveOrganizationModel('gazelle');
  const [answer, setAnswer] = useState<string>();
  return (
    <>
      <button
        onClick={() =>
          save(input).then(
            result => setAnswer(JSON.stringify(result)),
            () => undefined,
          )
        }
      >
        Save
      </button>
      {answer && <p data-testid="answer">{answer}</p>}
      {error && (
        <p data-testid="error">
          {error.name}:{' '}
          {error instanceof AgentManagerError ? error.code : error.message}
        </p>
      )}
    </>
  );
}

async function saveWith(
  input: SaveOrganizationModelInput,
  /** What a write tool answers, by tool. */
  answer: (tool: string) => Promise<unknown>,
  /** The organization's models `list_model_configs` answers. */
  existing: { name: string }[] = [],
  /**
   * Whether the installation's `set_organization_model` takes `create`;
   * agent-manager 2.24.0 and older do not.
   */
  createOnly = true,
  /**
   * Whether it takes the model settings (`maxTokens`, `promptCaching`,
   * `cacheTTL`); agent-manager before 3.1.0 does not.
   */
  settings = false,
) {
  const callTool = jest.fn(
    async (
      tool: string,
      _args: Record<string, unknown>,
      _installation: string,
      _options?: { urlElicitation?: boolean },
    ) => {
      if (tool === 'x_agent-manager_list_model_configs') {
        return { modelConfigs: existing };
      }
      // agent-manager without commit mode, unless `answer` says otherwise:
      // the writes are live.
      if (tool === 'x_agent-manager_get_info') {
        return Promise.resolve()
          .then(() => answer(tool))
          .catch(() => ({ capabilities: {} }));
      }
      return answer(tool);
    },
  );
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [
          musterApiRef,
          {
            callTool,
            describeTool: async () => ({
              inputSchema: {
                properties: Object.fromEntries(
                  [
                    'projectID',
                    'location',
                    'endpoint',
                    'displayName',
                    'noCredential',
                    ...(createOnly ? ['create'] : []),
                    ...(settings
                      ? ['maxTokens', 'promptCaching', 'cacheTTL']
                      : []),
                  ].map(key => [key, {}]),
                ),
              },
            }),
          } as never,
        ],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <Harness input={input} />
      </QueryClientProvider>
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/organizations': organizationsRouteRef,
        '/customize/models': modelsRouteRef,
      },
    },
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  return callTool;
}

/** Every call but the read of `get_info`, which decides the write's mode. */
function writeCalls(callTool: jest.Mock) {
  return callTool.mock.calls.filter(
    ([tool]) => tool !== 'x_agent-manager_get_info',
  );
}

/** The arguments of each `set_organization_model` call. */
function setCalls(callTool: jest.Mock) {
  return callTool.mock.calls
    .filter(([tool]) => tool === 'x_agent-manager_set_organization_model')
    .map(([, args]) => args);
}

/** A finished change: the key Secret is there. */
const present = async () => ({
  namespace: PAYMENTS.namespace,
  kind: 'model',
  name: 'claude-sonnet',
  credentials: [
    {
      secret: 'tenant-credential-claude-sonnet',
      key: 'apiKey',
      state: 'present',
    },
  ],
});

/** A prepared replacement of the model's key. */
const replaced = async () => ({
  namespace: PAYMENTS.namespace,
  kind: 'credential',
  name: 'tenant-credential-claude-sonnet',
  pending: true,
  credentialOperation: CREDENTIAL_OPERATION,
  credentials: [
    {
      secret: 'tenant-credential-claude-sonnet',
      key: 'apiKey',
      state: 'replace',
    },
  ],
});

const pending = async () => ({
  namespace: PAYMENTS.namespace,
  kind: 'model',
  name: 'claude-sonnet',
  pending: true,
  credentialOperation: CREDENTIAL_OPERATION,
  credentials: [
    {
      secret: 'tenant-credential-claude-sonnet',
      key: 'apiKey',
      state: 'missing',
    },
  ],
});

beforeEach(() => {
  analyticsApi.captureEvent.mockClear();
  mockDirectoryFailure = undefined;
});

describe('useSaveOrganizationModel', () => {
  it('keeps a supported custom endpoint and its noncredential query parameters', async () => {
    const endpoint = 'https://models.example/v1?api-version=2026-01-01';
    const callTool = await saveWith(
      {
        namespace: 'kagent',
        values: { ...VALUES, provider: 'OpenAI', endpoint },
      },
      present,
    );
    await screen.findByTestId('answer');
    expect(setCalls(callTool)[0]).toEqual(
      expect.objectContaining({ endpoint }),
    );
  });

  it.each(['Gemini', 'AnthropicVertexAI', 'GeminiVertexAI'] as const)(
    'omits hidden endpoint settings for %s after a provider change',
    async provider => {
      const callTool = await saveWith(
        {
          namespace: 'kagent',
          values: {
            ...VALUES,
            provider,
            endpoint: 'https://previous-provider.example/v1',
            insecureSkipTlsVerify: true,
            projectID: 'vertex-test',
            location: 'eu',
          },
        },
        present,
      );
      await screen.findByTestId('answer');
      expect(setCalls(callTool)).toHaveLength(1);
      expect(setCalls(callTool)[0]).not.toHaveProperty('endpoint');
      expect(setCalls(callTool)[0]).not.toHaveProperty('insecureSkipTLSVerify');
    },
  );

  it('prepares installation Vertex metadata through the manager and opens its installation credential page', async () => {
    const callTool = await saveWith(
      {
        namespace: 'kagent',
        values: {
          ...VALUES,
          provider: 'GeminiVertexAI',
          model: 'gemini-2.5-pro',
          projectID: 'vertex-test',
          location: 'global',
        },
      },
      pending,
    );
    expect(await screen.findByTestId('answer')).toHaveTextContent(
      `/customize/models/credentials/gazelle/kagent/${CREDENTIAL_OPERATION}`,
    );
    expect(setCalls(callTool)).toEqual([
      expect.objectContaining({
        namespace: 'kagent',
        provider: 'GeminiVertexAI',
        projectID: 'vertex-test',
        location: 'global',
        create: true,
      }),
    ]);
    expect(setCalls(callTool)[0]).not.toHaveProperty('apiKey');
  });
  it('refuses a namespace it cannot tell from an organization, writing nothing', async () => {
    mockDirectoryFailure = 'Could not reach agent-manager on gazelle.';
    const callTool = await saveWith(
      { namespace: 'agents-payments-x7k2q', values: VALUES },
      pending,
    );
    expect(await screen.findByTestId('error')).toHaveTextContent(
      "Could not tell whether agents-payments-x7k2q is an organization's namespace or the installation's",
    );
    expect(setCalls(callTool)).toEqual([]);
  });

  it("still saves in the installation's namespace while the organizations cannot be read", async () => {
    mockDirectoryFailure = 'Could not reach agent-manager on gazelle.';
    const callTool = await saveWith(
      { namespace: 'kagent', values: VALUES },
      pending,
    );
    expect(await screen.findByTestId('answer')).toBeInTheDocument();
    expect(setCalls(callTool)).toHaveLength(1);
  });

  it('asks agent-manager for a new model, without a key, and answers the credential form', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: VALUES },
      pending,
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      `/customize/models/credentials/gazelle/agents-payments-x7k2q/${CREDENTIAL_OPERATION}`,
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_set_organization_model',
      {
        namespace: PAYMENTS.namespace,
        name: 'claude-sonnet',
        provider: 'Anthropic',
        model: 'claude-sonnet-4-6',
        create: true,
        displayName: '',
        noCredential: false,
        requestId: expect.any(String),
      },
      'gazelle',
      // agent-manager answers the request's id, not a page to open.
      { urlElicitation: false },
    );
    // The model is not written yet: the credential form's save tracks it.
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('refuses a create on a name the organization already has, changing nothing', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: VALUES },
      pending,
      [{ name: 'claude-sonnet' }],
    );

    expect(await screen.findByTestId('error')).toHaveTextContent(
      'already has a model named claude-sonnet',
    );
    expect(setCalls(callTool)).toEqual([]);
  });

  it('leaves create out where the tool does not take it, so an older agent-manager writes the model', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: VALUES },
      pending,
      [],
      false,
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      CREDENTIAL_OPERATION,
    );
    expect(setCalls(callTool)).toHaveLength(1);
    expect(setCalls(callTool)[0]).not.toHaveProperty('create');
  });

  it('says the name is taken when a model of that name was made since the read', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: VALUES },
      async () => {
        throw new Error(
          `already_exists: ModelConfig ${PAYMENTS.namespace}/claude-sonnet exists already: pick another name, or call without create to change or replace it`,
        );
      },
    );

    const error = await screen.findByTestId('error');
    expect(error).toHaveTextContent(
      `The namespace ${PAYMENTS.namespace} already has a model named claude-sonnet. Choose another name, or edit that model.`,
    );
    expect(error).not.toHaveTextContent('already_exists');
    expect(setCalls(callTool)[0]).toMatchObject({ create: true });
  });

  it('moves the default mark to the new model when asked', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: VALUES, makeDefault: true },
      pending,
    );

    await screen.findByTestId('answer');
    expect(setCalls(callTool)[0]).toMatchObject({ default: true });
  });

  it('finishes an edit that keeps the key, with no form', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: VALUES, original: SONNET },
      async () => ({
        namespace: PAYMENTS.namespace,
        kind: 'model',
        name: 'claude-sonnet',
        defaultModel: 'claude-sonnet',
        credentials: [
          {
            secret: 'tenant-credential-claude-sonnet',
            key: 'apiKey',
            state: 'present',
          },
        ],
      }),
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      JSON.stringify({ isDefault: true, changed: true }),
    );
    expect(setCalls(callTool)[0]).not.toHaveProperty('replaceCredential');
    expect(setCalls(callTool)[0]).not.toHaveProperty('default');
    // An edit changes the model that exists: create would refuse it.
    expect(setCalls(callTool)[0]).not.toHaveProperty('create');
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AgentPlatform.modelUpdated' }),
    );
  });

  describe('in an organization applied from git, where agent-manager opens pull requests', () => {
    const PULL_REQUEST = {
      repository: 'giantswarm/gazelle-configs',
      base: 'main',
      pullRequest: 'https://github.com/giantswarm/gazelle-configs/pull/7',
      number: 7,
    };
    /** agent-manager with commit mode, and the organization's listing. */
    const answers =
      (orphaned?: { status: string; reason: string }) =>
      async (tool: string) => {
        switch (tool) {
          case 'x_agent-manager_get_info':
            return { capabilities: { organizations: true, commit: true } };
          case 'x_agent-manager_list_organizations':
            return {
              organizations: [
                {
                  name: PAYMENTS.organization,
                  parent: PAYMENTS.parent,
                  namespace: PAYMENTS.namespace,
                  ...(orphaned ? { orphaned } : {}),
                  permissions: { manage: false, member: true },
                },
              ],
            };
          case 'x_agent-manager_replace_organization_credential':
            return replaced();
          default:
            return { ...(await present()), commit: PULL_REQUEST };
        }
      };

    it('edits the model by pull request, and says nothing is changed yet', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: VALUES, original: SONNET },
        answers({ status: 'False', reason: 'InInventory' }),
      );

      expect(await screen.findByTestId('answer')).toHaveTextContent(
        JSON.stringify({
          isDefault: false,
          changed: false,
          commit: PULL_REQUEST,
        }),
      );
      expect(setCalls(callTool)).toEqual([
        expect.objectContaining({ mode: 'commit' }),
      ]);
      expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
    });

    it('asks for a new key by pull request', async () => {
      const callTool = await saveWith(
        {
          organization: PAYMENTS,
          values: SONNET_AS_STORED,
          original: SONNET,
          replaceKey: true,
        },
        answers({ status: 'False', reason: 'InInventory' }),
      );

      await screen.findByTestId('answer');
      expect(
        callTool.mock.calls
          .filter(
            ([tool]) =>
              tool === 'x_agent-manager_replace_organization_credential',
          )
          .map(([, args]) => args),
      ).toEqual([expect.objectContaining({ mode: 'commit' })]);
    });

    it('adds a model by pull request, its key on the form', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: VALUES },
        async tool =>
          tool === 'x_agent-manager_set_organization_model'
            ? pending()
            : answers({ status: 'False', reason: 'InInventory' })(tool),
      );

      expect(await screen.findByTestId('answer')).toHaveTextContent(
        CREDENTIAL_OPERATION,
      );
      expect(setCalls(callTool)).toEqual([
        expect.objectContaining({ create: true, mode: 'commit' }),
      ]);
    });

    it('keeps the pull request of the change when it goes on to the new key', async () => {
      await saveWith(
        {
          organization: PAYMENTS,
          values: VALUES,
          original: SONNET,
          replaceKey: true,
        },
        answers({ status: 'False', reason: 'InInventory' }),
      );

      const answer = JSON.parse(
        (await screen.findByTestId('answer')).textContent ?? '{}',
      );
      expect(answer).toEqual(
        expect.objectContaining({
          commit: PULL_REQUEST,
          form: expect.stringContaining(CREDENTIAL_OPERATION),
        }),
      );
    });

    it('refuses a namespace the listing does not name, writing nothing', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: VALUES, original: SONNET },
        async tool =>
          tool === 'x_agent-manager_list_organizations'
            ? { organizations: [] }
            : answers()(tool),
      );

      expect(await screen.findByTestId('error')).toHaveTextContent(
        `Could not tell whether the organization of ${PAYMENTS.namespace} is applied from git, so nothing was written.`,
      );
      expect(setCalls(callTool)).toEqual([]);
    });

    it("writes the installation's models live without reading the organizations", async () => {
      const callTool = await saveWith(
        { namespace: 'kagent', values: VALUES },
        answers(),
      );

      await screen.findByTestId('answer');
      expect(setCalls(callTool)[0]).not.toHaveProperty('mode');
      expect(
        callTool.mock.calls.filter(
          ([tool]) => tool === 'x_agent-manager_list_organizations',
        ),
      ).toEqual([]);
    });

    it('edits the model of a live organization live', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: VALUES, original: SONNET },
        answers(),
      );

      await screen.findByTestId('answer');
      expect(setCalls(callTool)[0]).not.toHaveProperty('mode');
    });
  });

  it('asks for a new key alone through replace_organization_credential, never sending the model', async () => {
    const callTool = await saveWith(
      {
        organization: PAYMENTS,
        values: SONNET_AS_STORED,
        original: SONNET,
        replaceKey: true,
      },
      replaced,
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      `/customize/models/credentials/gazelle/agents-payments-x7k2q/${CREDENTIAL_OPERATION}`,
    );
    expect(writeCalls(callTool)).toEqual([
      [
        'x_agent-manager_replace_organization_credential',
        {
          namespace: PAYMENTS.namespace,
          secret: 'tenant-credential-claude-sonnet',
          key: 'apiKey',
          requestId: expect.any(String),
        },
        'gazelle',
        // agent-manager answers the request's id, not a page to open.
        { urlElicitation: false },
      ],
    ]);
    // Nothing is written until the key is saved on the form.
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('asks for each new key with a fresh requestId, so a refused replacement starts again', async () => {
    const callTool = await saveWith(
      {
        organization: PAYMENTS,
        values: SONNET_AS_STORED,
        original: SONNET,
        replaceKey: true,
      },
      replaced,
    );
    await screen.findByTestId('answer');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writeCalls(callTool)).toHaveLength(2));

    const [first, second] = writeCalls(callTool).map(
      ([, args]) => (args as { requestId: string }).requestId,
    );
    expect(second).not.toBe(first);
  });

  it('writes the change first, then asks for the new key', async () => {
    const callTool = await saveWith(
      {
        organization: PAYMENTS,
        values: VALUES,
        original: SONNET,
        replaceKey: true,
      },
      async tool =>
        tool === 'x_agent-manager_replace_organization_credential'
          ? replaced()
          : present(),
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      `/credentials/gazelle/${PAYMENTS.namespace}/${CREDENTIAL_OPERATION}`,
    );
    expect(writeCalls(callTool).map(([tool]) => tool)).toEqual([
      'x_agent-manager_set_organization_model',
      'x_agent-manager_replace_organization_credential',
    ]);
    expect(setCalls(callTool)[0]).not.toHaveProperty('replaceCredential');
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AgentPlatform.modelUpdated' }),
    );
  });

  describe('when the portal refuses the session token on the new key', () => {
    const refused = () =>
      new MusterUnauthorizedError(
        'Failed user token verification',
        undefined,
        undefined,
        'gazelle',
        'AuthenticationError',
      );

    it('keeps the session error, for the page to offer the sign-in', async () => {
      await saveWith(
        {
          organization: PAYMENTS,
          values: SONNET_AS_STORED,
          original: SONNET,
          replaceKey: true,
        },
        async () => {
          throw refused();
        },
      );

      expect(await screen.findByTestId('error')).toHaveTextContent(
        /^PortalSessionEndedError:/,
      );
    });

    it('says the change is saved and the session ended, without "nothing was sent"', async () => {
      await saveWith(
        {
          organization: PAYMENTS,
          values: VALUES,
          original: SONNET,
          replaceKey: true,
        },
        async tool => {
          if (tool === 'x_agent-manager_replace_organization_credential') {
            throw refused();
          }
          return present();
        },
      );

      const error = await screen.findByTestId('error');
      expect(error).toHaveTextContent(
        /The model change is saved, but the new key could not be asked for\. Your portal session ended: reload the page to sign in again/,
      );
      expect(error).not.toHaveTextContent(/nothing was sent/);
    });
  });

  it('says the change is saved when the new key cannot be asked for', async () => {
    await saveWith(
      {
        organization: PAYMENTS,
        values: VALUES,
        original: SONNET,
        replaceKey: true,
      },
      async tool => {
        if (tool === 'x_agent-manager_replace_organization_credential') {
          throw new Error(
            'conflict: ModelConfig other reads key token of Secret tenant-credential-claude-sonnet, which a write of key apiKey would drop: the Secret is written whole, holding that one key',
          );
        }
        return present();
      },
    );

    expect(await screen.findByTestId('error')).toHaveTextContent(
      /The model change is saved, but the new key could not be asked for\. Another object reads a different key of the same Secret/,
    );
  });

  it('keeps the sign-in to agent-manager when a new key alone cannot be asked for', async () => {
    await saveWith(
      {
        organization: PAYMENTS,
        values: SONNET_AS_STORED,
        original: SONNET,
        replaceKey: true,
      },
      async () => {
        throw new Error(
          'tool not found: x_agent-manager_replace_organization_credential',
        );
      },
    );

    expect(await screen.findByTestId('error')).toHaveTextContent(
      'AgentManagerNotConnectedError',
    );
  });

  it('refuses to change the provider of an existing model, sending nothing', async () => {
    const callTool = await saveWith(
      {
        organization: PAYMENTS,
        values: { ...VALUES, provider: 'OpenAI' },
        original: SONNET,
        replaceKey: true,
      },
      replaced,
    );

    expect(await screen.findByTestId('error')).toHaveTextContent(
      'keeps its provider',
    );
    expect(callTool).not.toHaveBeenCalled();
  });

  it("passes agent-manager's refusal on with its code", async () => {
    await saveWith({ organization: PAYMENTS, values: VALUES }, async () => {
      throw new Error(
        `forbidden: you may not create modelconfigs in ${PAYMENTS.namespace}: agent-platform:admin grants it`,
      );
    });

    expect(await screen.findByTestId('error')).toHaveTextContent('forbidden');
  });

  describe('the model settings', () => {
    /** The stored Sonnet, with a token limit and caching for an hour. */
    const STORED = new ModelConfig(
      {
        ...SONNET.jsonData,
        metadata: {
          ...SONNET.jsonData.metadata,
          annotations: { 'ui.giantswarm.io/display-name': 'Sonnet' },
        },
        spec: {
          ...SONNET.jsonData.spec,
          anthropic: { maxTokens: 4096, promptCaching: true, cacheTTL: '1h' },
        },
      } as ModelConfigInterface,
      'gazelle',
    );
    const STORED_VALUES = {
      ...VALUES,
      model: 'claude-sonnet-4-5',
      displayName: 'Sonnet',
      maxTokens: 4096,
      promptCaching: true,
      cacheTTL: '1h' as const,
    };

    it('sends a new Anthropic model with caching on for 5 minutes, the default', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: VALUES },
        pending,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      const [args] = setCalls(callTool);
      expect(args).toMatchObject({ promptCaching: true, cacheTTL: '5m' });
      // No token limit typed: the provider's default.
      expect(args).not.toHaveProperty('maxTokens');
    });

    it('sends each setting of a new model', async () => {
      const callTool = await saveWith(
        {
          organization: PAYMENTS,
          values: {
            ...VALUES,
            displayName: 'Sonnet',
            maxTokens: 8192,
            promptCaching: true,
            cacheTTL: '1h',
          },
        },
        pending,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      expect(setCalls(callTool)[0]).toMatchObject({
        displayName: 'Sonnet',
        maxTokens: 8192,
        promptCaching: true,
        cacheTTL: '1h',
      });
    });

    it('sends caching off without a cache time', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: { ...VALUES, promptCaching: false } },
        pending,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      const [args] = setCalls(callTool);
      expect(args).toMatchObject({ promptCaching: false });
      expect(args).not.toHaveProperty('cacheTTL');
    });

    it('sends only the token limit for a provider without prompt caching', async () => {
      const callTool = await saveWith(
        {
          organization: PAYMENTS,
          values: { ...VALUES, provider: 'OpenAI', maxTokens: 2048 },
        },
        pending,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      const [args] = setCalls(callTool);
      expect(args).toMatchObject({ maxTokens: 2048 });
      expect(args).not.toHaveProperty('promptCaching');
      expect(args).not.toHaveProperty('cacheTTL');
    });

    it('sends no setting for a provider that has none', async () => {
      const callTool = await saveWith(
        {
          organization: PAYMENTS,
          values: {
            ...VALUES,
            provider: 'GeminiVertexAI',
            projectID: 'fixture-models',
            location: 'europe-west1',
            maxTokens: 2048,
          },
        },
        pending,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      const [args] = setCalls(callTool);
      for (const setting of ['maxTokens', 'promptCaching', 'cacheTTL']) {
        expect(args).not.toHaveProperty(setting);
      }
    });

    it('sends no setting where the tool does not take them, an older agent-manager', async () => {
      const callTool = await saveWith(
        { organization: PAYMENTS, values: { ...VALUES, maxTokens: 2048 } },
        pending,
      );

      await screen.findByTestId('answer');
      const [args] = setCalls(callTool);
      for (const setting of ['maxTokens', 'promptCaching', 'cacheTTL']) {
        expect(args).not.toHaveProperty(setting);
      }
    });

    it('sends no setting for a model of the platform', async () => {
      const callTool = await saveWith(
        { namespace: 'kagent', values: { ...VALUES, maxTokens: 2048 } },
        present,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      const [args] = setCalls(callTool);
      for (const setting of ['maxTokens', 'promptCaching', 'cacheTTL']) {
        expect(args).not.toHaveProperty(setting);
      }
    });

    it.each([
      ['the token limit', { maxTokens: 16000 }, { maxTokens: 16000 }],
      ['prompt caching', { promptCaching: false }, { promptCaching: false }],
      ['the cache time', { cacheTTL: '5m' as const }, { cacheTTL: '5m' }],
      [
        'the display name',
        { displayName: 'Claude' },
        { displayName: 'Claude' },
      ],
    ])(
      'sends only %s when an edit changes only that',
      async (_what, change, sent) => {
        const callTool = await saveWith(
          {
            organization: PAYMENTS,
            values: { ...STORED_VALUES, ...change },
            original: STORED,
          },
          present,
          [],
          true,
          true,
        );

        await screen.findByTestId('answer');
        const [args] = setCalls(callTool);
        expect(args).toMatchObject(sent);
        // Nothing else of the settings: an omitted one keeps its value.
        expect(
          ['displayName', 'maxTokens', 'promptCaching', 'cacheTTL'].filter(
            setting => setting in args && !(setting in sent),
          ),
        ).toEqual([]);
      },
    );

    it('removes the token limit and the display name with the values agent-manager documents', async () => {
      const callTool = await saveWith(
        {
          organization: PAYMENTS,
          values: { ...STORED_VALUES, maxTokens: undefined, displayName: '' },
          original: STORED,
        },
        present,
        [],
        true,
        true,
      );

      await screen.findByTestId('answer');
      expect(setCalls(callTool)[0]).toMatchObject({
        maxTokens: 0,
        displayName: '',
      });
    });

    it('says which setting the API server refused, without its raw text', async () => {
      await saveWith(
        {
          organization: PAYMENTS,
          values: { ...VALUES, provider: 'OpenAI', maxTokens: 2048 },
        },
        async () => {
          throw new Error(
            `invalid_request: dry run of create ModelConfig ${PAYMENTS.namespace}/claude-sonnet: strict decoding error: unknown field "spec.openAI.maxTokens"`,
          );
        },
        [],
        true,
        true,
      );

      const error = await screen.findByTestId('error');
      expect(error).toHaveTextContent(
        'OpenAI models have no token limit, so the setting was refused and nothing was saved.',
      );
      expect(error).not.toHaveTextContent('strict decoding');
    });
  });
});
