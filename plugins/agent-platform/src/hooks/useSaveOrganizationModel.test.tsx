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
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import { CREDENTIAL_OPERATION } from '../lib/__fixtures__/agentManagerOrganizations';
import { AgentManagerError } from '../lib/agentManager';
import { INITIAL_MODEL_CONFIG_FORM } from '../lib/modelConfigs';
import { organizationsRouteRef } from '../routes';
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

const analyticsApi = mockApis.analytics.mock();

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
) {
  const callTool = jest.fn(
    async (
      tool: string,
      _args: Record<string, unknown>,
      _installation: string,
      _options?: { urlElicitation?: boolean },
    ) =>
      tool === 'x_agent-manager_list_model_configs'
        ? { modelConfigs: existing }
        : answer(tool),
  );
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, { callTool } as never],
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
    { mountedRoutes: { '/organizations': organizationsRouteRef } },
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  return callTool;
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
});

describe('useSaveOrganizationModel', () => {
  it('asks agent-manager for a new model, without a key, and answers the credential form', async () => {
    const callTool = await saveWith(
      { organization: PAYMENTS, values: { ...VALUES, apiKey: 'sk-typed' } },
      pending,
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      `/organizations/gazelle/org-acme/payments/credentials/${CREDENTIAL_OPERATION}`,
    );
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_set_organization_model',
      {
        namespace: PAYMENTS.namespace,
        name: 'claude-sonnet',
        provider: 'Anthropic',
        model: 'claude-sonnet-4-6',
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
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('replaceCredential');
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('default');
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AgentPlatform.modelUpdated' }),
    );
  });

  it('asks for a new key alone through replace_organization_credential, never sending the model', async () => {
    const callTool = await saveWith(
      {
        organization: PAYMENTS,
        values: { ...VALUES, model: 'claude-sonnet-4-5' },
        original: SONNET,
        replaceKey: true,
      },
      replaced,
    );

    expect(await screen.findByTestId('answer')).toHaveTextContent(
      `/organizations/gazelle/org-acme/payments/credentials/${CREDENTIAL_OPERATION}`,
    );
    expect(callTool.mock.calls).toEqual([
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
        values: { ...VALUES, model: 'claude-sonnet-4-5' },
        original: SONNET,
        replaceKey: true,
      },
      replaced,
    );
    await screen.findByTestId('answer');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(2));

    const [first, second] = callTool.mock.calls.map(
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
      `/credentials/${CREDENTIAL_OPERATION}`,
    );
    expect(callTool.mock.calls.map(([tool]) => tool)).toEqual([
      'x_agent-manager_set_organization_model',
      'x_agent-manager_replace_organization_credential',
    ]);
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('replaceCredential');
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AgentPlatform.modelUpdated' }),
    );
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
        values: { ...VALUES, model: 'claude-sonnet-4-5' },
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
});
