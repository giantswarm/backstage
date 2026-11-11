import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { ResponseError } from '@backstage/errors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The GitHub connection prompt reads the connector through the Muster API.
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
  PageHeaderActionsProvider,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  type AgentManagerCredentialsApi,
  agentManagerCredentialsApiRef,
} from '../../apis';
import { fakeOrganizationsMuster } from '../../lib/__fixtures__/agentManagerOrganizations';
import type {
  CredentialOperation,
  CredentialOperationRead,
} from '../../lib/credentialOperations';
import { organizationsRouteRef } from '../../routes';
import { CredentialFormPage } from './CredentialFormPage';

const OPERATION = 'a1'.repeat(24);
const VALUE = 'sk-ant-api03-never-shown';

const CONFIRMATION: CredentialOperation = {
  id: OPERATION,
  version: '3',
  state: 'pending',
  mode: 'apply',
  organization: {
    namespace: 'agents-payments-x7k2q',
    parent: 'org-acme',
    organization: 'payments',
  },
  changes: [
    {
      action: 'create',
      object: {
        kind: 'ModelConfig',
        metadata: { name: 'claude-sonnet' },
        spec: {
          provider: 'Anthropic',
          anthropic: { baseUrl: 'https://llm-proxy.example.com' },
        },
      },
    },
  ],
  references: [
    { kind: 'ModelConfig', name: 'claude-sonnet', key: 'api-key' },
    {
      kind: 'EgressPolicy',
      name: 'anthropic-egress',
      key: 'api-key',
      origins: ['https://api.anthropic.com:443'],
    },
  ],
  result: {
    kind: 'model',
    name: 'claude-sonnet',
    pending: true,
    credentials: [
      {
        secret: 'tenant-credential-anthropic',
        key: 'api-key',
        state: 'missing',
      },
    ],
  },
};

/** The portal backend's error body for one of agent-manager's codes. */
async function refusal(status: number, code: string, message: string) {
  return ResponseError.fromResponse(
    new Response(
      JSON.stringify({
        error: { name: 'AgentManagerError', message, code },
        request: { method: 'POST', url: '/' },
        response: { statusCode: status },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    ),
  );
}

function read(operation: CredentialOperation = CONFIRMATION) {
  return async (): Promise<CredentialOperationRead> => ({
    operation,
    etag: `"${operation.version}"`,
  });
}

function fakeCredentialsApi(
  reader: () => Promise<CredentialOperationRead> = read(),
) {
  return {
    getOperation: jest.fn(reader),
    saveOperation: jest.fn(async () => ({
      kind: 'model' as const,
      name: 'claude-sonnet',
      credentials: [
        {
          secret: 'tenant-credential-anthropic',
          key: 'api-key',
          state: 'present' as const,
        },
      ],
    })),
    cancelOperation: jest.fn(async () => undefined),
  } satisfies AgentManagerCredentialsApi;
}

const analyticsApi = mockApis.analytics.mock();

async function renderForm(
  credentialsApi: AgentManagerCredentialsApi,
  { operation = OPERATION, name = 'payments' } = {},
) {
  const { api: musterApi } = fakeOrganizationsMuster({});
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [agentManagerCredentialsApiRef, credentialsApi],
        [musterApiRef, musterApi],
        [analyticsApiRef, analyticsApi],
        // The GitHub connection prompt's sign-in asks before it opens
        // muster's page; without the API it suspends and never renders.
        [externalUrlConsentApiRef, new ExternalUrlConsentManager(jest.fn())],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <CredentialFormPage
            installation="gazelle"
            parent="org-acme"
            name={name}
            operation={operation}
          />
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/organizations': organizationsRouteRef } },
  );
  return queryClient;
}

describe('CredentialFormPage', () => {
  beforeEach(() => analyticsApi.captureEvent.mockClear());

  it('opens the request the link names and shows what the value is for before it takes one', async () => {
    let resolve!: (value: CredentialOperationRead) => void;
    const api = fakeCredentialsApi(() => new Promise(r => (resolve = r)));
    await renderForm(api);

    expect(api.getOperation).toHaveBeenCalledWith('gazelle', OPERATION);
    expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();

    resolve({ operation: CONFIRMATION, etag: '"3"' });

    expect(
      await screen.findByText(/Model claude-sonnet \(new\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('payments · org-acme · agents-payments-x7k2q · gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Egress policy anthropic-egress, key api-key/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://api.anthropic.com:443'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://llm-proxy.example.com'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Secret tenant-credential-anthropic, key api-key/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Value/)).toBeEnabled();
    expect(screen.getByLabelText(/^Value/)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  it('refuses a request prepared for another organization than the link names', async () => {
    const api = fakeCredentialsApi();
    await renderForm(api, { name: 'treasury' });

    expect(
      await screen.findByText('This request is not for treasury'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();
    expect(api.saveOperation).not.toHaveBeenCalled();
  });

  it('posts the value once with the confirmation’s version and never shows it back', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    const queryClient = await renderForm(api);

    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Credential saved')).toBeInTheDocument();
    expect(
      screen.getByText(/^Model claude-sonnet has its credential\./),
    ).toBeInTheDocument();
    expect(api.saveOperation).toHaveBeenCalledTimes(1);
    expect(api.saveOperation).toHaveBeenCalledWith(
      'gazelle',
      OPERATION,
      '"3"',
      [{ secret: 'tenant-credential-anthropic', key: 'api-key', value: VALUE }],
    );
    expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(VALUE);
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map(m => m.state),
      ),
    ).not.toContain(VALUE);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.organizationCredentialSaved',
        attributes: { mode: 'apply' },
      }),
    );
  });

  it('asks for every value before it saves, and saves them all at once', async () => {
    const user = userEvent.setup();
    const twoPairs: CredentialOperation = {
      ...CONFIRMATION,
      result: {
        ...CONFIRMATION.result,
        credentials: [
          { secret: 'tenant-credential-jira', key: 'token', state: 'missing' },
          {
            secret: 'tenant-credential-jira-cloud',
            key: 'cloud-id',
            state: 'replace',
          },
          { secret: 'tenant-credential-jira', key: 'token', state: 'missing' },
        ],
      },
    };
    const api = fakeCredentialsApi(read(twoPairs));
    await renderForm(api);

    await user.type(await screen.findByLabelText(/^Value of token/), 'a');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saveOperation).not.toHaveBeenCalled();
    expect(await screen.findByText('Enter the value.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Value of cloud-id/), 'b');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveOperation).toHaveBeenCalledWith(
        'gazelle',
        OPERATION,
        '"3"',
        [
          { secret: 'tenant-credential-jira', key: 'token', value: 'a' },
          {
            secret: 'tenant-credential-jira-cloud',
            key: 'cloud-id',
            value: 'b',
          },
        ],
      ),
    );
  });

  it('reads the request again when it changed, and asks for the value again', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    api.saveOperation.mockRejectedValueOnce(
      await refusal(412, 'precondition_failed', 'stale'),
    );
    await renderForm(api);

    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Check the request again'),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText(/^Value/)).toHaveValue('');
  });

  it('keeps the value on a refusal that a retry may fix', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    api.saveOperation.mockRejectedValueOnce(
      await refusal(409, 'conflict', 'the model changed meanwhile'),
    );
    await renderForm(api);

    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('the model changed meanwhile'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Value/)).toHaveValue(VALUE);
  });

  it('says a save that did not answer in time may still complete, and reads the request again', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    api.saveOperation.mockRejectedValueOnce(
      await refusal(504, 'outcome_unknown', 'did not answer in time'),
    );
    await renderForm(api);

    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/The save may still complete/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['saving', 'apply'],
    ['uncertain', 'commit'],
  ] as const)(
    'finishes a %s save in %s mode without asking for the value again',
    async (state, mode) => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi(read({ ...CONFIRMATION, state, mode }));
      await renderForm(api);

      await user.click(
        await screen.findByRole('button', { name: 'Finish the save' }),
      );

      await waitFor(() =>
        expect(api.saveOperation).toHaveBeenCalledWith(
          'gazelle',
          OPERATION,
          '"3"',
          [],
        ),
      );
      expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();
    },
  );

  it('asks for the value again to finish an uncertain save in apply mode', async () => {
    const api = fakeCredentialsApi(
      read({ ...CONFIRMATION, state: 'uncertain' }),
    );
    await renderForm(api);

    expect(
      await screen.findByText('An earlier save of this request did not finish'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Value/)).toBeEnabled();
  });

  it('asks for the GitHub connection when a commit needs it', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi(
      read({
        ...CONFIRMATION,
        mode: 'commit',
        gitTarget: {
          repository: 'acme/configs',
          base: 'main',
          directory: 'orgs/payments',
        },
      }),
    );
    api.saveOperation.mockRejectedValueOnce(
      await refusal(
        401,
        'auth_required',
        'connect GitHub to open the pull request',
      ),
    );
    await renderForm(api);

    expect(
      await screen.findByText(
        /A pull request to acme\/configs on main, in orgs\/payments/,
      ),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/connect GitHub to open the pull request/),
    ).toBeInTheDocument();
  });

  it('cancels the request', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    await renderForm(api);

    await user.click(
      await screen.findByRole('button', { name: 'Cancel request' }),
    );

    expect(await screen.findByText('Request cancelled')).toBeInTheDocument();
    expect(api.cancelOperation).toHaveBeenCalledWith(
      'gazelle',
      OPERATION,
      '"3"',
    );
    expect(api.saveOperation).not.toHaveBeenCalled();
  });

  it('says a request that is gone is gone', async () => {
    const api = fakeCredentialsApi(async () => {
      throw await refusal(404, 'not_found', 'not found');
    });
    await renderForm(api);
    expect(await screen.findByText('This request is gone')).toBeInTheDocument();
  });

  it('reads nothing for a link that names no request', async () => {
    const api = fakeCredentialsApi();
    await renderForm(api, { operation: 'not-an-id' });
    expect(
      await screen.findByText('This link names no request'),
    ).toBeInTheDocument();
    expect(api.getOperation).not.toHaveBeenCalled();
  });
});
