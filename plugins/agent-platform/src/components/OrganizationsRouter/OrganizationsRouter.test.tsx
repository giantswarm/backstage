import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { ResponseError } from '@backstage/errors';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Organization requests use the Muster API.
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  CONTENT_PULL_REQUEST,
  CREATED_NEXT,
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationsRouter } from './OrganizationsRouter';
import {
  agentManagerCredentialsApiRef,
  type AgentManagerCredentialsApi,
} from '../../apis';
import type { CredentialOperationRead } from '../../lib/credentialOperations';

jest.mock('../QueryClientProvider', () => {
  const { QueryClient, QueryClientProvider } = jest.requireActual(
    '@tanstack/react-query',
  );
  const { useState } = jest.requireActual('react');
  return {
    QueryClientProvider: ({ children }: { children: ReactNode }) => {
      const [client] = useState(
        () =>
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          }),
      );
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    },
  };
});

// An organization the person manages whose namespace the operator never
// created: its delete erases it at once, before the list is read again.
const PAYMENTS = {
  name: 'payments',
  displayName: 'Payments',
  harnesses: ['kagent'],
  workerReplicas: 0,
};

/** The Organizations page with Create organization open on gazelle. */
async function openCreateDialog(
  scenario: OrganizationsScenario,
  analyticsApi = mockApis.analytics.mock(),
) {
  const { api, callTool } = fakeOrganizationsMuster(scenario);
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [kubernetesApiRef, fakeOrganizationAccess()],
        [analyticsApiRef, analyticsApi],
        [externalUrlConsentApiRef, new ExternalUrlConsentManager(jest.fn())],
      ]}
    >
      <Routes>
        <Route path="/organizations/*" element={<OrganizationsRouter />} />
      </Routes>
    </TestApiProvider>,
    {
      initialRouteEntries: ['/organizations'],
      mountedRoutes: { '/organizations': organizationsRouteRef },
    },
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Create organization' }),
  );
  const dialog = await screen.findByRole('dialog');
  // The dialog knows how organizations are created there once get_info answers.
  await waitFor(() =>
    expect(
      within(dialog).queryByText(/^Reading how organizations are created/),
    ).toBeNull(),
  );
  return { dialog, callTool };
}

describe('OrganizationsRouter', () => {
  it.each(['pending', 'saved', 'cancelled', 'stale'] as const)(
    'keeps %s credential state with its request when another organization opens',
    async state => {
      const user = userEvent.setup();
      const firstOperation = 'a1'.repeat(24);
      const nextOperation = 'b2'.repeat(24);
      const credentialsApi = {
        getOperation: jest.fn(
          async (
            _installation: string,
            operation: string,
          ): Promise<CredentialOperationRead> => ({
            etag: '"3"',
            operation: {
              id: operation,
              version: '3',
              state: 'pending',
              mode: 'apply',
              organization: {
                organization:
                  operation === firstOperation ? 'payments' : 'billing',
              },
              result: {
                kind: 'credential',
                credentials: [
                  {
                    secret: 'tenant-credential-shared',
                    key: 'token',
                    state: 'replace',
                  },
                ],
              },
            },
          }),
        ),
        saveOperation: jest.fn(async () => ({
          kind: 'credential' as const,
          name: 'tenant-credential-shared',
        })),
        cancelOperation: jest.fn(async () => undefined),
      } satisfies AgentManagerCredentialsApi;
      if (state === 'stale') {
        credentialsApi.saveOperation.mockRejectedValueOnce(
          await ResponseError.fromResponse(
            new Response(
              JSON.stringify({
                error: {
                  name: 'AgentManagerError',
                  code: 'credential_consumers_changed',
                  message: 'changed',
                },
                request: { method: 'POST', url: '/' },
                response: { statusCode: 409 },
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } },
            ),
          ),
        );
      }
      const { api } = fakeOrganizationsMuster({});
      await renderInTestApp(
        <TestApiProvider
          apis={[
            [musterApiRef, api],
            [kubernetesApiRef, fakeOrganizationAccess()],
            [agentManagerCredentialsApiRef, credentialsApi],
            [analyticsApiRef, mockApis.analytics.mock()],
            [
              externalUrlConsentApiRef,
              new ExternalUrlConsentManager(jest.fn()),
            ],
          ]}
        >
          <Routes>
            <Route
              path="/organizations/*"
              element={
                <>
                  <OrganizationsRouter />
                  <RouterLink
                    to={`/organizations/gazelle/billing/credentials/${nextOperation}`}
                  >
                    Open next request
                  </RouterLink>
                </>
              }
            />
          </Routes>
        </TestApiProvider>,
        {
          initialRouteEntries: [
            `/organizations/gazelle/payments/credentials/${firstOperation}`,
          ],
          mountedRoutes: { '/organizations': organizationsRouteRef },
        },
      );
      await user.type(
        await screen.findByLabelText(/^Value/),
        'synthetic-credential',
      );
      if (state === 'saved' || state === 'stale') {
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await screen.findByText(
          state === 'saved'
            ? 'Credential saved'
            : 'The objects that use this credential changed',
        );
      } else if (state === 'cancelled') {
        await user.click(
          screen.getByRole('button', { name: 'Cancel request' }),
        );
        await screen.findByText('Request cancelled');
      }
      await user.click(screen.getByRole('link', { name: 'Open next request' }));
      expect(await screen.findByLabelText(/^Value/)).toHaveValue('');
      expect(credentialsApi.getOperation).toHaveBeenLastCalledWith(
        'gazelle',
        nextOperation,
      );
      expect(screen.queryByText('Credential saved')).toBeNull();
      expect(screen.queryByText('Request cancelled')).toBeNull();
      expect(
        screen.queryByText('The objects that use this credential changed'),
      ).toBeNull();
    },
  );

  it('keeps a delete with its organization: another one opened next is not erased', async () => {
    const user = userEvent.setup();
    const scenario: OrganizationsScenario = {
      mine: { organizations: [] },
      organization: PAYMENTS,
    };
    const { api, callTool } = fakeOrganizationsMuster(scenario);
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [musterApiRef, api],
          [kubernetesApiRef, fakeOrganizationAccess()],
          [analyticsApiRef, mockApis.analytics.mock()],
        ]}
      >
        <Routes>
          <Route
            path="/organizations/*"
            element={
              <>
                <OrganizationsRouter />
                {/* Another organization the person is no member of, opened
                    in the same mounted router (a link, the history). */}
                <RouterLink to="/organizations/gazelle/billing">
                  Open billing
                </RouterLink>
              </>
            }
          />
        </Routes>
      </TestApiProvider>,
      {
        initialRouteEntries: ['/organizations/gazelle/payments'],
        mountedRoutes: { '/organizations': organizationsRouteRef },
      },
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete organization' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      await within(dialog).findByLabelText('Type payments to confirm'),
      'payments',
    );
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete organization',
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    delete scenario.organization;
    await user.click(confirm);
    expect(await screen.findByText('payments is erased')).toBeInTheDocument();
    expect(toolCalls(callTool, 'delete_organization')).toHaveLength(1);

    await user.click(screen.getByRole('link', { name: 'Open billing' }));

    expect(
      await screen.findByText('You are not a member of billing'),
    ).toBeInTheDocument();
    expect(screen.queryByText('billing is erased')).toBeNull();
  });

  it('creates an organization with its admins and opens its page at once, not ready yet', async () => {
    const user = userEvent.setup();
    const analyticsApi = mockApis.analytics.mock();
    // agent-manager lists the new organization only on a later read.
    const { dialog, callTool } = await openCreateDialog(
      { mine: { organizations: [] } },
      analyticsApi,
    );
    // agent-manager opens no pull requests here: no choice, a direct create.
    expect(within(dialog).queryByRole('radiogroup')).toBeNull();
    // The one installation is named as an installation, not as the product,
    // and each field shows its mark once, as the label reads on screen.
    expect(
      within(dialog).getByText(
        'The organization is created on the installation gazelle.',
      ),
    ).toBeInTheDocument();
    const labelText = (name: RegExp) =>
      (within(dialog).getByRole('textbox', { name }) as HTMLInputElement)
        .labels?.[0]?.textContent;
    expect(labelText(/^Name/)).toBe('Name(Required)');
    expect(labelText(/^Display name/)).toBe('Display name(optional)');
    expect(labelText(/^Admin groups/)).toBe('Admin groups(optional)');
    expect(labelText(/^Admin people/)).toBe('Admin people(optional)');
    // A name that cannot name an Organization is caught before agent-manager.
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'Payments',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create organization' }),
    );
    expect(
      await within(dialog).findByText(
        /^Use lowercase letters, digits and hyphens/,
      ),
    ).toBeInTheDocument();
    expect(toolCalls(callTool, 'create_organization')).toEqual([]);

    await user.clear(within(dialog).getByRole('textbox', { name: /^Name/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'payments',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Admin groups/ }),
      'payments-leads\n\nplatform-team',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create organization' }),
    );

    await waitFor(() =>
      expect(toolCalls(callTool, 'create_organization')).toEqual([
        {
          name: 'payments',
          adminGroups: ['payments-leads', 'platform-team'],
        },
      ]),
    );
    expect(
      await screen.findByText('payments is not ready yet'),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(CREATED_NEXT))).toBeInTheDocument();
    expect(screen.queryByText(/You are not a member/)).toBeNull();
    // Not ready is a state, not an error: no tool is asked for its content,
    // which agent-manager would refuse as not ready yet.
    for (const tool of [
      'list_organization_members',
      'list_model_configs',
      'list_organization_connectors',
      'list_egress_policies',
    ]) {
      expect(toolCalls(callTool, tool)).toEqual([]);
    }
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AgentPlatform.organizationCreated' }),
    );
  });

  it('offers a pull request first where agent-manager opens them, and shows it without opening a page', async () => {
    const user = userEvent.setup();
    const { dialog, callTool } = await openCreateDialog({
      mine: { organizations: [] },
      commitMode: true,
    });
    const how = within(dialog).getByRole('radiogroup', {
      name: /^How to create it/,
    });
    expect(
      within(how).getByRole('radio', { name: /^With a pull request/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByText(/^You cannot change this later\./),
    ).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'payments',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Open pull request' }),
    );

    expect(
      await within(dialog).findByTestId('organization-create-pull-request'),
    ).toHaveTextContent(/is created once the pull request is merged/);
    expect(
      within(dialog).getByRole('link', { name: /Review pull request/ }),
    ).toHaveAttribute('href', CONTENT_PULL_REQUEST.pullRequest);
    expect(toolCalls(callTool, 'create_organization')).toEqual([
      { name: 'payments', mode: 'commit' },
    ]);
    // No organization exists yet: the dialog stays, no page opens, and the
    // Organizations page shows no error for it.
    // The footer's Close, not the dialog's icon button of the same name.
    await user.click(
      within(dialog)
        .getAllByRole('button', { name: 'Close' })
        .find(button => button.textContent === 'Close')!,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('payments is not ready yet')).toBeNull();
    expect(screen.queryByText(/^Could not/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Create organization' }),
    ).toBeInTheDocument();
  });

  it('creates directly where agent-manager opens pull requests when the person chooses it', async () => {
    const user = userEvent.setup();
    const { dialog, callTool } = await openCreateDialog({
      mine: { organizations: [] },
      commitMode: true,
    });
    await user.click(within(dialog).getByRole('radio', { name: /^Directly/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'payments',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create organization' }),
    );

    expect(
      await screen.findByText('payments is not ready yet'),
    ).toBeInTheDocument();
    expect(toolCalls(callTool, 'create_organization')).toEqual([
      { name: 'payments' },
    ]);
  });

  it("shows agent-manager's refusal of a pull request in its words", async () => {
    const user = userEvent.setup();
    const refusal =
      'unsupported: mode commit is not configured for organizations on this installation (no organizations repository): use mode apply';
    const { dialog } = await openCreateDialog({
      mine: { organizations: [] },
      commitMode: true,
      createError: refusal,
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Name/ }),
      'payments',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Open pull request' }),
    );

    expect(
      await within(dialog).findByText(
        /mode commit is not configured for organizations on this installation \(no organizations repository\): use mode apply/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByTestId('organization-create-pull-request'),
    ).toBeNull();
  });
});
