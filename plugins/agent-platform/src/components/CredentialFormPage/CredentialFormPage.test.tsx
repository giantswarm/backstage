import { Route, Routes } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The GitHub connection prompt reads the connector through the Muster API.
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  type AgentManagerCredentialsApi,
  agentManagerCredentialsApiRef,
  CredentialOperationError,
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
        spec: { provider: 'Anthropic' },
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
    kind: 'ModelConfig',
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

function fakeCredentialsApi(
  read: () => Promise<CredentialOperationRead> = async () => ({
    operation: CONFIRMATION,
    etag: '"3"',
  }),
) {
  return {
    getOperation: jest.fn(read),
    saveOperation: jest.fn(async () => ({
      kind: 'ModelConfig',
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
  search = `?operation=${OPERATION}`,
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
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route
              path="/organizations/:installation/:parent/:name/credentials"
              element={
                <CredentialFormPage
                  installation="gazelle"
                  parent="org-acme"
                  name="payments"
                />
              }
            />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [
        `/organizations/gazelle/org-acme/payments/credentials${search}`,
      ],
      mountedRoutes: { '/organizations': organizationsRouteRef },
    },
  );
  return queryClient;
}

describe('CredentialFormPage', () => {
  beforeEach(() => analyticsApi.captureEvent.mockClear());

  it('opens the request the link names and shows what the value is for before it takes one', async () => {
    let resolve!: (read: CredentialOperationRead) => void;
    const api = fakeCredentialsApi(() => new Promise(r => (resolve = r)));
    await renderForm(api);

    expect(api.getOperation).toHaveBeenCalledWith('gazelle', OPERATION);
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();

    resolve({ operation: CONFIRMATION, etag: '"3"' });

    expect(
      await screen.findByText(/Model claude-sonnet \(new\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Egress policy anthropic-egress, key api-key/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://api.anthropic.com:443'),
    ).toBeInTheDocument();
    expect(screen.getByText('Model provider Anthropic')).toBeInTheDocument();
    expect(
      screen.getByText(/Secret tenant-credential-anthropic, key api-key/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Value')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('posts the value once with the confirmation’s version and never shows it back', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    const queryClient = await renderForm(api);

    await user.type(await screen.findByLabelText('Value'), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Credential saved')).toBeInTheDocument();
    expect(api.saveOperation).toHaveBeenCalledTimes(1);
    expect(api.saveOperation).toHaveBeenCalledWith(
      'gazelle',
      OPERATION,
      '"3"',
      [{ secret: 'tenant-credential-anthropic', key: 'api-key', value: VALUE }],
    );
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
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

  it('reads the request again when it changed, and asks for the value again', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi();
    api.saveOperation.mockRejectedValueOnce(
      new CredentialOperationError(412, 'precondition_failed', 'stale'),
    );
    await renderForm(api);

    await user.type(await screen.findByLabelText('Value'), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Check the request again'),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.getOperation).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Value')).toHaveValue('');
  });

  it('asks for the GitHub connection when a commit needs it', async () => {
    const user = userEvent.setup();
    const api = fakeCredentialsApi(async () => ({
      operation: {
        ...CONFIRMATION,
        mode: 'commit',
        gitTarget: {
          repository: 'acme/configs',
          base: 'main',
          directory: 'orgs/payments',
        },
      },
      etag: '"3"',
    }));
    api.saveOperation.mockRejectedValueOnce(
      new CredentialOperationError(
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
    await user.type(screen.getByLabelText('Value'), VALUE);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/connect GitHub to open the pull request/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Value')).toHaveValue('');
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
      throw new CredentialOperationError(404, 'not_found', 'not found');
    });
    await renderForm(api);
    expect(await screen.findByText('This request is gone')).toBeInTheDocument();
  });

  it('explains the form when the address names no request', async () => {
    const api = fakeCredentialsApi();
    await renderForm(api, '?operation=not-an-id');
    expect(
      await screen.findByText('Open this form from a request'),
    ).toBeInTheDocument();
    expect(api.getOperation).not.toHaveBeenCalled();
  });
});
