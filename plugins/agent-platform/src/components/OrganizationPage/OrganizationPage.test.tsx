import { Route, Routes, useLocation } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  CREDENTIAL_OPERATION,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationPage } from './OrganizationPage';

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

const SCENARIO: OrganizationsScenario = {
  mine: { organizations: [PAYMENTS] },
  members: [
    {
      kind: 'Group',
      name: 'payments-team',
      role: 'editor',
      binding: 'organization-editors',
    },
    {
      kind: 'Group',
      name: 'payments-leads',
      role: 'admin',
      binding: 'organization-admins',
    },
    {
      kind: 'User',
      name: 'jane@example.com',
      role: 'user',
      binding: 'organization-users',
    },
  ],
  models: {
    [PAYMENTS.namespace]: [
      {
        name: 'claude-sonnet',
        namespace: PAYMENTS.namespace,
        provider: 'Anthropic',
        model: 'claude-sonnet-4-6',
        accepted: true,
        default: true,
      },
      {
        name: 'gpt',
        namespace: PAYMENTS.namespace,
        provider: 'OpenAI',
        model: 'gpt-5',
        accepted: true,
      },
    ],
  },
  connectors: [
    {
      name: 'jira',
      url: 'https://jira.example.com/mcp',
      credentials: [
        {
          header: 'Authorization',
          secret: 'tenant-credential-jira',
          key: 'token',
        },
      ],
    },
  ],
  egressPolicies: [
    {
      name: 'payments-api',
      namespace: PAYMENTS.namespace,
      destinations: [
        {
          origin: 'https://api.stripe.com:443',
          credentialHeader: 'Authorization',
        },
      ],
    },
  ],
};

const analyticsApi = mockApis.analytics.mock();

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

async function renderPage(tab: string, scenario: OrganizationsScenario) {
  const { api, callTool } = fakeOrganizationsMuster(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route
              path="/organizations/:installation/:parent/:name/credentials"
              element={<LocationProbe />}
            />
            <Route
              path="/organizations/:installation/:parent/:name/*"
              element={
                <OrganizationPage
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
      initialRouteEntries: [`/organizations/gazelle/org-acme/payments${tab}`],
      mountedRoutes: { '/organizations': organizationsRouteRef },
    },
  );
  return { callTool };
}

beforeEach(() => {
  analyticsApi.captureEvent.mockClear();
});

describe('OrganizationPage', () => {
  it('shows the members agent-manager lists, each with its role, from the organization namespace it names', async () => {
    const { callTool } = await renderPage('', SCENARIO);

    const table = await screen.findByRole('grid');
    expect(
      within(table).getByRole('rowheader', { name: /payments-team/ }),
    ).toBeInTheDocument();
    expect(within(table).getByText('jane@example.com')).toBeInTheDocument();
    expect(within(table).getByText('Person')).toBeInTheDocument();
    for (const tab of ['Members', 'Models', 'Connectors', 'Egress']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    }
    // The namespace is agent-manager's answer, never derived from a name.
    expect(toolCalls(callTool, 'list_organization_members')).toEqual([
      { namespace: PAYMENTS.namespace },
    ]);
  });

  it('offers a group first, and adds one with its role as the person', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('', SCENARIO);

    const kind = await screen.findByRole('radiogroup', { name: 'Add' });
    expect(within(kind).getAllByRole('radio')[0]).toHaveAccessibleName(
      'A group',
    );
    expect(within(kind).getByRole('radio', { name: 'A group' })).toBeChecked();

    await user.type(screen.getByRole('textbox', { name: /Group/ }), 'sre');
    await user.click(screen.getByRole('button', { name: 'Add group' }));

    await waitFor(() =>
      expect(toolCalls(callTool, 'add_organization_member')).toEqual([
        { namespace: PAYMENTS.namespace, group: 'sre', role: 'user' },
      ]),
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.organizationMemberAdded',
        attributes: { kind: 'group', role: 'user' },
      }),
    );
  });

  it('asks for a name rather than adding nothing', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('', SCENARIO);

    await user.click(await screen.findByRole('button', { name: 'Add group' }));

    expect(
      await screen.findByText("Enter the group's name."),
    ).toBeInTheDocument();
    expect(toolCalls(callTool, 'add_organization_member')).toEqual([]);
  });

  it('offers no removal of a subject other than a group or a person', async () => {
    await renderPage('', {
      ...SCENARIO,
      members: [
        {
          kind: 'ServiceAccount',
          name: 'robot',
          namespace: 'agents-payments-x7k2q',
          role: 'user',
          binding: 'organization-users',
        },
      ],
    });

    expect(await screen.findByText('robot')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove robot/ })).toBeNull();
  });

  it('adds a person as the second choice', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('', SCENARIO);

    await user.click(await screen.findByRole('radio', { name: /A person/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Person/ }),
      'joe@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Add person' }));

    await waitFor(() =>
      expect(toolCalls(callTool, 'add_organization_member')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          user: 'joe@example.com',
          role: 'user',
        },
      ]),
    );
  });

  it('removes a member as the person, and reports it', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('', SCENARIO);

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove jane@example.com as user',
      }),
    );
    // Asked first: nothing is removed before the person confirms.
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove person "jane@example.com"?',
    });
    expect(toolCalls(callTool, 'remove_organization_member')).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(toolCalls(callTool, 'remove_organization_member')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          user: 'jane@example.com',
          role: 'user',
        },
      ]),
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.organizationMemberRemoved',
        attributes: { kind: 'person' },
      }),
    );
  });

  it("shows agent-manager's reason when removing the last admin of organization-admins is refused", async () => {
    const user = userEvent.setup();
    await renderPage('', {
      ...SCENARIO,
      removeError:
        "forbidden: RoleBinding agents-payments-x7k2q/organization-admins: if organization-admins would lose its last admin: add another admin first (add_organization_member role admin); a lockout is a cluster-admin's to fix",
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove payments-leads as admin',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove group "payments-leads"?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(
      await within(dialog).findByText('payments-leads was not removed.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/add another admin first/),
    ).toBeInTheDocument();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('shows the models with the default mark agent-manager resolves', async () => {
    await renderPage('/models', SCENARIO);

    const sonnet = (
      await screen.findByRole('rowheader', { name: /claude-sonnet/ })
    ).closest('[role="row"]') as HTMLElement;
    expect(within(sonnet).getByText('Default')).toBeInTheDocument();
    const gpt = screen
      .getByRole('rowheader', { name: /^gpt/ })
      .closest('[role="row"]') as HTMLElement;
    expect(within(gpt).queryByText('Default')).toBeNull();
  });

  it("asks for the organization's own key when it has no model, on the credential form", async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('/models', {
      ...SCENARIO,
      models: {},
    });

    expect(
      await screen.findByText('This organization has no model yet'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add model' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('textbox', { name: /Name/ }),
      'claude',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /Model/ }),
      'claude-sonnet-4-6',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Continue to the key' }),
    );

    await waitFor(() =>
      expect(toolCalls(callTool, 'set_organization_model')).toEqual([
        expect.objectContaining({
          namespace: PAYMENTS.namespace,
          name: 'claude',
          provider: 'Anthropic',
          model: 'claude-sonnet-4-6',
          requestId: expect.any(String),
        }),
      ]),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/organizations/gazelle/org-acme/payments/credentials?operation=${CREDENTIAL_OPERATION}`,
    );
  });

  it('asks for a new key of a model on the credential form', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('/models', SCENARIO);

    await user.click(
      await screen.findByRole('button', { name: 'Replace the key of gpt' }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Continue',
      }),
    );

    await waitFor(() =>
      expect(toolCalls(callTool, 'set_organization_model')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          name: 'gpt',
          replaceCredential: true,
          requestId: expect.any(String),
        },
      ]),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `credentials?operation=${CREDENTIAL_OPERATION}`,
    );
  });

  it('asks for a new connector credential on the credential form', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('/connectors', SCENARIO);

    await user.click(
      await screen.findByRole('button', {
        name: 'Replace the credential of jira',
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Continue',
      }),
    );

    await waitFor(() =>
      expect(toolCalls(callTool, 'set_organization_connector')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          name: 'jira',
          replaceCredential: true,
          requestId: expect.any(String),
        },
      ]),
    );
  });

  it('shows the connectors and their credentials by Secret name', async () => {
    await renderPage('/connectors', SCENARIO);

    expect(await screen.findByText('jira')).toBeInTheDocument();
    expect(
      screen.getByText('Authorization ← tenant-credential-jira'),
    ).toBeInTheDocument();
  });

  it('shows the egress policies and their origins', async () => {
    await renderPage('/egress', SCENARIO);

    expect(await screen.findByText('payments-api')).toBeInTheDocument();
    expect(
      screen.getByText('https://api.stripe.com:443 (adds Authorization)'),
    ).toBeInTheDocument();
  });

  it('says the person is no member of an organization agent-manager does not list for them', async () => {
    await renderPage('', { ...SCENARIO, mine: { organizations: [] } });

    expect(
      await screen.findByText('You are not a member of payments'),
    ).toBeInTheDocument();
  });
});
