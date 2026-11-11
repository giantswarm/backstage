import { useState } from 'react';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
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
          {error instanceof AgentManagerError ? error.code : error.message}
        </p>
      )}
    </>
  );
}

async function saveWith(
  input: SaveOrganizationModelInput,
  answer: () => Promise<unknown>,
  /** The organization's models `list_model_configs` answers. */
  existing: { name: string }[] = [],
) {
  const callTool = jest.fn(
    async (
      tool: string,
      _args: Record<string, unknown>,
      _installation: string,
    ) =>
      tool === 'x_agent-manager_list_model_configs'
        ? { modelConfigs: existing }
        : answer(),
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
      JSON.stringify({ isDefault: true }),
    );
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('replaceCredential');
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('default');
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AgentPlatform.modelUpdated' }),
    );
  });

  it('asks for a new key on an edit that replaces it', async () => {
    const callTool = await saveWith(
      {
        organization: PAYMENTS,
        values: VALUES,
        original: SONNET,
        replaceKey: true,
      },
      pending,
    );

    await screen.findByTestId('answer');
    expect(callTool.mock.calls[0][1]).toMatchObject({
      replaceCredential: true,
    });
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
