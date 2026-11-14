/* eslint-disable @backstage/no-mixed-plugin-imports -- The Agent Platform composes installation APIs across plugins. */
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { ResponseError } from '@backstage/errors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The GitHub connection prompt reads the connector through the Muster API.
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The GitHub connection prompt uses the Muster API.
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
  CredentialResourceResult,
} from '../../lib/credentialOperations';
import { organizationsRouteRef } from '../../routes';
import { CredentialFormPage } from './CredentialFormPage';
import { PortalSessionEndedError } from '../../lib/portalSession';
import { agentManagerCredentialOperationQueryKey } from '../../lib/queryKeys';

// Sign in again reloads the page, which jsdom cannot.
const mockReloadPage = jest.fn();
jest.mock('../../lib/portalSession', () => ({
  ...jest.requireActual('../../lib/portalSession'),
  reloadPage: () => mockReloadPage(),
}));

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
    saveOperation: jest.fn(async (): Promise<CredentialResourceResult> => ({
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

  it('discards a file read that finishes after the confirmation is refreshed', async () => {
    const confirmation: CredentialOperation = {
      ...CONFIRMATION,
      result: {
        ...CONFIRMATION.result,
        credentials: [
          {
            secret: 'tenant-credential-vertex',
            key: 'GOOGLE_APPLICATION_CREDENTIALS',
            state: 'missing',
            inputFormat: 'google-service-account-json',
          },
        ],
      },
    };
    const api = fakeCredentialsApi(read(confirmation));
    await renderForm(api);
    const input = await screen.findByLabelText('Service account key file');
    const raw = JSON.stringify({
      type: 'service_account',
      project_id: 'vertex-test',
      client_email: 'late@vertex-test.iam.gserviceaccount.com',
      private_key: 'synthetic-private-key',
    });
    let finishRead!: (value: string) => void;
    const file = new File([raw], 'vertex.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: () =>
        new Promise<string>(resolve => {
          finishRead = resolve;
        }),
    });
    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await act(async () => {
      finishRead(raw);
    });
    expect(screen.queryByText(/late@vertex-test/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saveOperation).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Choose the service account key file/),
    ).toBeInTheDocument();
  });

  it.each(['"3"', '"4"'])(
    'clears input and blocks writes while refreshing the confirmation to %s',
    async etag => {
      const user = userEvent.setup();
      let finishRead!: (result: CredentialOperationRead) => void;
      const api = fakeCredentialsApi();
      api.getOperation
        .mockResolvedValueOnce({ operation: CONFIRMATION, etag: '"3"' })
        .mockImplementation(
          () =>
            new Promise(resolve => {
              finishRead = resolve;
            }),
        );
      await renderForm(api);
      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      await user.click(screen.getByRole('button', { name: 'Check again' }));
      expect(screen.getByLabelText(/^Value/)).toHaveValue('');
      expect(screen.getByLabelText(/^Value/)).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Cancel request' }),
      ).toBeDisabled();
      finishRead({ operation: CONFIRMATION, etag });
      await waitFor(() =>
        expect(screen.getByLabelText(/^Value/)).toBeEnabled(),
      );
      await user.type(screen.getByLabelText(/^Value/), VALUE);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByText('Credential saved');
      expect(api.saveOperation).toHaveBeenCalledWith(
        'gazelle',
        OPERATION,
        etag,
        expect.any(Array),
      );
    },
  );
  it('uploads Vertex JSON through the credential REST operation without showing its private key', async () => {
    const confirmation: CredentialOperation = {
      ...CONFIRMATION,
      result: {
        ...CONFIRMATION.result,
        credentials: [
          {
            secret: 'tenant-credential-vertex',
            key: 'GOOGLE_APPLICATION_CREDENTIALS',
            state: 'missing',
            inputFormat: 'google-service-account-json',
          },
        ],
      },
    };
    const api = fakeCredentialsApi(read(confirmation));
    await renderForm(api);
    const input = await screen.findByLabelText('Service account key file');
    expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();
    const raw = JSON.stringify({
      type: 'service_account',
      project_id: 'vertex-test',
      client_email: 'agent@vertex-test.iam.gserviceaccount.com',
      private_key: 'synthetic-private-key',
      token_uri: 'https://oauth2.googleapis.com/token',
    });
    const file = new File([raw], 'vertex.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => raw });
    await userEvent.upload(input, file);
    await screen.findByText(/agent@vertex-test.iam.gserviceaccount.com/);
    expect(screen.queryByText(/synthetic-private-key/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveOperation).toHaveBeenCalledWith(
        'gazelle',
        OPERATION,
        '"3"',
        [
          {
            secret: 'tenant-credential-vertex',
            key: 'GOOGLE_APPLICATION_CREDENTIALS',
            value: raw,
          },
        ],
      ),
    );
  });

  it('rejects a non-service-account JSON upload before submission', async () => {
    const confirmation: CredentialOperation = {
      ...CONFIRMATION,
      result: {
        ...CONFIRMATION.result,
        credentials: [
          {
            secret: 'tenant-credential-vertex',
            key: 'GOOGLE_APPLICATION_CREDENTIALS',
            state: 'missing',
            inputFormat: 'google-service-account-json',
          },
        ],
      },
    };
    const api = fakeCredentialsApi(read(confirmation));
    await renderForm(api);
    const input = await screen.findByLabelText('Service account key file');
    const file = new File(['{}'], 'wrong.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => '{}' });
    await userEvent.upload(input, file);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.saveOperation).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/This file is not a service account key/),
    ).toBeInTheDocument();
  });

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

  it('has the model views read the saved model again', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    const queryClient = await renderForm(api);
    // The models list as read before the save, still fresh.
    const gvk = ModelConfig.getGVK();
    const listKey = [
      'cluster',
      'gazelle',
      'list',
      gvk.group,
      gvk.apiVersion,
      gvk.plural,
    ];
    queryClient.setQueryData(listKey, []);

    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Credential saved')).toBeInTheDocument();
    await waitFor(() =>
      expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true),
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

  describe('a replacement of a credential', () => {
    // replace_organization_credential: the Secret only, for the objects
    // stored when it was prepared.
    const REPLACEMENT: CredentialOperation = {
      ...CONFIRMATION,
      changes: [],
      references: [
        {
          kind: 'ModelConfig',
          name: 'claude-sonnet',
          key: 'api-key',
          provider: 'Anthropic',
        },
        {
          kind: 'EgressPolicy',
          name: 'anthropic-egress',
          key: 'api-key',
          origins: ['https://api.anthropic.com:443'],
        },
      ],
      result: {
        kind: 'credential',
        name: 'tenant-credential-anthropic',
        pending: true,
        credentials: [
          {
            secret: 'tenant-credential-anthropic',
            key: 'api-key',
            state: 'replace',
          },
        ],
      },
    };

    it('says it writes the Secret only, for every object that uses it, and where each sends it', async () => {
      await renderForm(fakeCredentialsApi(read(REPLACEMENT)));

      expect(
        await screen.findByText(
          /The value of Secret tenant-credential-anthropic, key api-key\. No model, connector or egress policy is changed\./,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Used by')).toBeInTheDocument();
      expect(
        screen.getByText(/Model claude-sonnet, key api-key/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Egress policy anthropic-egress, key api-key/),
      ).toBeInTheDocument();
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(
        screen.getByText('https://api.anthropic.com:443'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/^Value/)).toHaveAccessibleDescription(
        expect.stringContaining('It replaces the current value once saved.'),
      );
    });

    it('asks for the value, not a new one, when the Secret does not exist yet', async () => {
      await renderForm(
        fakeCredentialsApi(
          read({
            ...REPLACEMENT,
            result: {
              ...REPLACEMENT.result,
              credentials: [
                {
                  secret: 'tenant-credential-anthropic',
                  key: 'api-key',
                  state: 'missing',
                },
              ],
            },
          }),
        ),
      );

      const value = await screen.findByLabelText(/^Value/);
      expect(value).not.toHaveAccessibleDescription(
        expect.stringContaining('replaces'),
      );
      expect(screen.getByText('Sets')).toBeInTheDocument();
      expect(screen.queryByText('Replaces')).not.toBeInTheDocument();
    });

    it('says the value is saved for the objects that use it', async () => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi(read(REPLACEMENT));
      api.saveOperation.mockResolvedValueOnce({
        kind: 'credential',
        name: 'tenant-credential-anthropic',
        credentials: [
          {
            secret: 'tenant-credential-anthropic',
            key: 'api-key',
            state: 'present',
          },
        ],
      });
      await renderForm(api);

      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          /The new value of Secret tenant-credential-anthropic is saved/,
        ),
      ).toBeInTheDocument();
    });

    it('does not say to start again on a conflict that is not a change of its objects', async () => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi(read(REPLACEMENT));
      api.saveOperation.mockRejectedValueOnce(
        await refusal(
          409,
          'conflict',
          'credential save is in progress; retry after it finishes',
        ),
      );
      await renderForm(api);

      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Not saved')).toBeInTheDocument();
      expect(
        screen.queryByText('The objects that use this credential changed'),
      ).not.toBeInTheDocument();
    });

    it('says to prepare it again when the objects that use it changed', async () => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi(read(REPLACEMENT));
      api.saveOperation.mockRejectedValueOnce(
        // agent-manager's answer since giantswarm/agent-manager#373.
        await refusal(
          409,
          'credential_consumers_changed',
          'the objects that use this credential, or where they send it, changed since the replacement was prepared; prepare it again',
        ),
      );
      await renderForm(api);

      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      const backLinks = screen.getAllByRole('link', {
        name: 'Back to payments',
      }).length;
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('The objects that use this credential changed'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Start the replacement again from the organization's tab/,
        ),
      ).toBeInTheDocument();
      // The same request would be refused again: no value, no Save, and the
      // way back to the tab where it starts again.
      expect(screen.queryByLabelText(/^Value/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      expect(
        screen.getAllByRole('link', { name: 'Back to payments' }),
      ).toHaveLength(backLinks + 1);
      expect(api.saveOperation).toHaveBeenCalledTimes(1);
    });

    it("keeps an older agent-manager's conflict as Not saved, whatever its text", async () => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi(read(REPLACEMENT));
      api.saveOperation.mockRejectedValueOnce(
        await refusal(
          409,
          'conflict',
          'the objects in agents-payments-x7k2q that use Secret tenant-credential-anthropic, or where they send its value, changed since the preparation; prepare it again',
        ),
      );
      await renderForm(api);

      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Not saved')).toBeInTheDocument();
      expect(
        screen.queryByText('The objects that use this credential changed'),
      ).not.toBeInTheDocument();
    });
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

    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText('Check the request again')).toBeNull(),
    );
    expect(await screen.findByLabelText(/^Value/)).toHaveValue('');
  });

  describe('when the portal refuses the session token', () => {
    // A restart of a portal without a database loses the keys it signed the
    // session token with; nothing reaches agent-manager.
    it('says the session ended and to sign in again, and drops the value', async () => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi();
      // What the client answers for the portal's refusal of the session
      // token (AgentManagerCredentialsApi.test.ts).
      api.saveOperation.mockRejectedValueOnce(new PortalSessionEndedError());
      await renderForm(api);

      const value = await screen.findByLabelText(/^Value/);
      await user.type(value, VALUE);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText('Your portal session ended'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Sign in again' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/token verification/)).toBeNull();
      expect(screen.queryByText('Not saved')).toBeNull();
      expect(screen.getByLabelText(/^Value/)).toHaveValue('');
      expect(document.body.innerHTML).not.toContain(VALUE);

      await user.click(screen.getByRole('button', { name: 'Sign in again' }));
      expect(mockReloadPage).toHaveBeenCalledTimes(1);
    });

    it('says the session ended when a cancel is refused, not "Not cancelled"', async () => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi();
      api.cancelOperation.mockRejectedValueOnce(new PortalSessionEndedError());
      await renderForm(api);

      await user.click(
        await screen.findByRole('button', { name: 'Cancel request' }),
      );

      expect(
        await screen.findByText('Your portal session ended'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Not cancelled')).toBeNull();
    });

    it('opens the same request again after the sign-in, from its address', async () => {
      const refused = fakeCredentialsApi(async () => {
        throw new PortalSessionEndedError();
      });
      const first = await renderForm(refused);
      expect(
        await screen.findByText('Your portal session ended'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/this page opens it again after the sign-in/),
      ).toBeInTheDocument();
      first.clear();
      cleanup();

      // The reload: the same address, a session the portal accepts.
      const api = fakeCredentialsApi();
      await renderForm(api);

      expect(await screen.findByLabelText(/^Value/)).toBeInTheDocument();
      expect(api.getOperation).toHaveBeenCalledWith('gazelle', OPERATION);
    });
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

    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByText('Check the request again'),
      ).not.toBeInTheDocument(),
    );
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
    expect(
      screen.getByText('Authorize GitHub for agent-manager'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
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

  it('recovers a stale cancellation with the current version and clears values and notices', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    api.cancelOperation.mockRejectedValueOnce(
      await refusal(412, 'precondition_failed', 'changed'),
    );
    api.getOperation
      .mockResolvedValueOnce({ operation: CONFIRMATION, etag: '"3"' })
      .mockResolvedValue({ operation: CONFIRMATION, etag: '"4"' });
    await renderForm(api);
    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText(/^Value/)).toHaveValue('');
    expect(screen.queryByText('Not cancelled')).toBeNull();
    expect(screen.queryByText('Check the request again')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel request' }));
    await screen.findByText('Request cancelled');
    expect(api.cancelOperation).toHaveBeenLastCalledWith(
      'gazelle',
      OPERATION,
      '"4"',
    );
    expect(api.getOperation).toHaveBeenCalledTimes(2);
  });

  it.each(['save', 'cancel'] as const)(
    'keeps the local %s result when the subsequent read fails',
    async action => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi();
      api.getOperation
        .mockResolvedValueOnce({ operation: CONFIRMATION, etag: '"3"' })
        .mockRejectedValue(new Error('read failed'));
      const queryClient = await renderForm(api);
      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      await user.click(
        screen.getByRole('button', {
          name: action === 'save' ? 'Save' : 'Cancel request',
        }),
      );
      await screen.findByText(
        action === 'save' ? 'Credential saved' : 'Request cancelled',
      );
      expect(api.getOperation).toHaveBeenCalledTimes(1);
      await queryClient.refetchQueries({
        queryKey: agentManagerCredentialOperationQueryKey('gazelle', OPERATION),
      });
      await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
      expect(screen.queryByText(/Could not read the request/)).toBeNull();
      expect(screen.queryByLabelText(/^Value/)).toBeNull();
    },
  );

  it.each(['save', 'cancel'] as const)(
    'prefers the local %s result over a contradictory read',
    async action => {
      const user = userEvent.setup();
      const api = fakeCredentialsApi();
      api.getOperation
        .mockResolvedValueOnce({ operation: CONFIRMATION, etag: '"3"' })
        .mockResolvedValue({
          operation: {
            ...CONFIRMATION,
            state: action === 'save' ? 'cancelled' : 'complete',
          },
          etag: '"4"',
        });
      const queryClient = await renderForm(api);
      await user.type(await screen.findByLabelText(/^Value/), VALUE);
      await user.click(
        screen.getByRole('button', {
          name: action === 'save' ? 'Save' : 'Cancel request',
        }),
      );
      await screen.findByText(
        action === 'save' ? 'Credential saved' : 'Request cancelled',
      );
      expect(api.getOperation).toHaveBeenCalledTimes(1);
      await queryClient.refetchQueries({
        queryKey: agentManagerCredentialOperationQueryKey('gazelle', OPERATION),
      });
      await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
      expect(
        screen.queryByText(
          action === 'save' ? 'Request cancelled' : 'Credential saved',
        ),
      ).toBeNull();
      expect(screen.queryByLabelText(/^Value/)).toBeNull();
    },
  );

  it('clears an unknown-outcome notice on a successful retry without rendering the stale uncertain state', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi(
      read({ ...CONFIRMATION, state: 'uncertain' }),
    );
    api.saveOperation.mockRejectedValueOnce(
      await refusal(502, 'outcome_unknown', 'unknown'),
    );
    await renderForm(api);
    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    api.getOperation.mockRejectedValue(new Error('read failed'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    api.getOperation.mockImplementation(
      read({ ...CONFIRMATION, state: 'uncertain' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Check again' }),
    );
    await user.type(await screen.findByLabelText(/^Value/), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Credential saved');
    expect(screen.queryByText('Check the request again')).toBeNull();
    expect(
      screen.queryByText('An earlier save of this request did not finish'),
    ).toBeNull();
    expect(screen.queryByLabelText(/^Value/)).toBeNull();
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
