import { Route, Routes } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
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
  describe('an organization whose file left git', () => {
    const COMMIT = '0123456789abcdef0123456789abcdef01234567';
    const ORGANIZATION = {
      name: 'payments',
      parent: 'org-acme',
      namespace: PAYMENTS.namespace,
      harnesses: ['kagent'],
      workerReplicas: 3,
    };

    it('is Missing from git, linking the last commit that held its file', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: {
          ...ORGANIZATION,
          orphaned: {
            status: 'True',
            reason: 'MissingFromGit',
            message: 'missing from the inventory of the Kustomization',
          },
          lastAppliedRevision: `main@sha1:${COMMIT}`,
          lastAppliedRevisionUrl: `https://github.com/giantswarm/gazelle-configs/commit/${COMMIT}`,
        },
      });

      expect(await screen.findByText('Missing from git')).toBeInTheDocument();
      expect(
        screen.getByRole('link', {
          name: new RegExp(`main@sha1:${COMMIT.slice(0, 7)}`),
        }),
      ).toHaveAttribute(
        'href',
        `https://github.com/giantswarm/gazelle-configs/commit/${COMMIT}`,
      );
      expect(
        screen.getByRole('button', { name: 'Technical details' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Pending erase')).not.toBeInTheDocument();
    });

    it('names the commit when agent-manager has no link for it', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: {
          ...ORGANIZATION,
          orphaned: { status: 'True', reason: 'MissingFromGit' },
          lastAppliedRevision: `main@sha1:${COMMIT}`,
        },
      });

      expect(await screen.findByText('Missing from git')).toBeInTheDocument();
      expect(
        screen.getByText(`main@sha1:${COMMIT.slice(0, 7)}`),
      ).toHaveAttribute('title', `main@sha1:${COMMIT}`);
      expect(
        screen.queryByRole('link', { name: /main@sha1/ }),
      ).not.toBeInTheDocument();
    });

    it('is Pending erase once its delete pull request merged', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: {
          ...ORGANIZATION,
          orphaned: { status: 'True', reason: 'DeleteMerged' },
          lastAppliedRevision: `main@sha1:${COMMIT}`,
        },
      });

      expect(await screen.findByText('Pending erase')).toBeInTheDocument();
      expect(screen.queryByText('Missing from git')).not.toBeInTheDocument();
    });

    it('is Erasing once the organization is deleted', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: {
          ...ORGANIZATION,
          orphaned: { status: 'True', reason: 'DeleteMerged' },
          lastAppliedRevision: `main@sha1:${COMMIT}`,
          deleting: true,
        },
      });

      expect(await screen.findByText('Erasing')).toBeInTheDocument();
      expect(screen.queryByText('Pending erase')).not.toBeInTheDocument();
    });

    it('shows nothing while the organization is in git', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: {
          ...ORGANIZATION,
          orphaned: { status: 'False', reason: 'InInventory' },
          lastAppliedRevision: `main@sha1:${COMMIT}`,
        },
      });

      expect(await screen.findByRole('grid')).toBeInTheDocument();
      expect(screen.queryByText('Missing from git')).not.toBeInTheDocument();
      expect(screen.queryByText('Pending erase')).not.toBeInTheDocument();
    });
  });

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

  it("asks for the organization's own key when it has no model, linking the credential form", async () => {
    await renderPage('/models', { ...SCENARIO, models: {} });

    expect(
      await screen.findByText('This organization has no model yet'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add model' })).toHaveAttribute(
      'href',
      '/organizations/gazelle/org-acme/payments/credentials',
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
