import { Route, Routes, useLocation } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Organization requests use the Muster API.
import {
  musterApiRef,
  MusterUnauthorizedError,
} from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  CREDENTIAL_OPERATION,
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { musterOrganizationsQueryKey } from '../../lib/queryKeys';
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
  modelKeys: {
    gpt: { secret: 'tenant-credential-gpt', key: 'OPENAI_API_KEY' },
  },
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
        [
          kubernetesApiRef,
          fakeOrganizationAccess(scenario.access, scenario.modelKeys),
        ],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route
              path="/organizations/:installation/:parent/:name/credentials/:operation"
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
  return { callTool, queryClient };
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
      expect(
        screen.getByText(/members are kept until it is erased/),
      ).toBeInTheDocument();
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
          erasureStep: 'Sessions',
        },
      });

      expect(await screen.findByText('Erasing')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Technical details' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Pending erase')).not.toBeInTheDocument();
    });

    it('is Erasing once deleted, also when it was not applied from git', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: { ...ORGANIZATION, deleting: true },
      });

      expect(await screen.findByText('Erasing')).toBeInTheDocument();
    });

    it('reads an organization being erased again every 10 s', async () => {
      jest.useFakeTimers();
      try {
        const { callTool } = await renderPage('', {
          ...SCENARIO,
          organization: {
            ...ORGANIZATION,
            orphaned: { status: 'True', reason: 'DeleteMerged' },
            deleting: true,
          },
        });
        await screen.findByText('Erasing');
        const reads = toolCalls(callTool, 'get_organization').length;

        await act(async () => {
          jest.advanceTimersByTime(10_000);
        });

        await waitFor(() =>
          expect(toolCalls(callTool, 'get_organization')).toHaveLength(
            reads + 1,
          ),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('says the organization is erased once its read answers not_found', async () => {
      jest.useFakeTimers();
      try {
        const scenario: OrganizationsScenario = {
          ...SCENARIO,
          organization: { ...ORGANIZATION, deleting: true },
        };
        const { callTool } = await renderPage('', scenario);
        await screen.findByText('Erasing');

        scenario.organizationErased = true;
        await act(async () => {
          jest.advanceTimersByTime(10_000);
        });

        expect(
          await screen.findByText('payments is erased'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Erasing')).not.toBeInTheDocument();
        expect(screen.queryByRole('grid')).not.toBeInTheDocument();

        const reads = toolCalls(callTool, 'get_organization').length;
        await act(async () => {
          jest.advanceTimersByTime(30_000);
        });
        expect(toolCalls(callTool, 'get_organization')).toHaveLength(reads);
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps reading an organization being erased after a failed read', async () => {
      jest.useFakeTimers();
      try {
        let failures = 1;
        const scenario: OrganizationsScenario = {
          ...SCENARIO,
          organization: { ...ORGANIZATION, deleting: true },
        };
        const { callTool } = await renderPage('', scenario);
        await screen.findByText('Erasing');
        const fake = callTool.getMockImplementation()!;
        callTool.mockImplementation(async (name: string, args) => {
          if (name === 'x_agent-manager_get_organization' && failures > 0) {
            failures -= 1;
            throw new Error(
              'backend_error: the API server did not answer in time',
            );
          }
          return fake(name, args);
        });
        const reads = toolCalls(callTool, 'get_organization').length;

        await act(async () => {
          jest.advanceTimersByTime(10_000);
        });
        await act(async () => {
          jest.advanceTimersByTime(10_000);
        });

        await waitFor(() =>
          expect(toolCalls(callTool, 'get_organization')).toHaveLength(
            reads + 2,
          ),
        );
        expect(screen.getByText('Erasing')).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
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

  describe('changes on Pending erase and while Erasing', () => {
    const WHY =
      'Its delete is merged, so its members, models and credentials can no longer be changed.';
    const WHY_ERASING =
      'It is being erased, so its members, models and credentials can no longer be changed.';
    const ORGANIZATION = {
      name: 'payments',
      parent: 'org-acme',
      namespace: PAYMENTS.namespace,
      harnesses: ['kagent'],
      workerReplicas: 3,
    };
    const PENDING_ERASE: OrganizationsScenario = {
      ...SCENARIO,
      organization: {
        ...ORGANIZATION,
        gitops: 'flux-giantswarm/agent-platform-organizations',
        orphaned: { status: 'True', reason: 'DeleteMerged' },
      },
    };
    const IN_GIT: OrganizationsScenario = {
      ...SCENARIO,
      organization: {
        ...ORGANIZATION,
        gitops: 'flux-giantswarm/agent-platform-organizations',
        orphaned: { status: 'False', reason: 'InInventory' },
      },
    };
    const ERASING: OrganizationsScenario = {
      ...SCENARIO,
      organization: {
        ...ORGANIZATION,
        gitops: 'flux-giantswarm/agent-platform-organizations',
        orphaned: { status: 'True', reason: 'DeleteMerged' },
        deleting: true,
      },
    };
    const MISSING_FROM_GIT: OrganizationsScenario = {
      ...SCENARIO,
      organization: {
        ...ORGANIZATION,
        gitops: 'flux-giantswarm/agent-platform-organizations',
        orphaned: { status: 'True', reason: 'MissingFromGit' },
      },
    };

    /**
     * Each control names the reason for screen readers: a radio through its
     * group, a form field next to its own help.
     */
    function expectEachNamesWhy(controls: HTMLElement[], why: string) {
      for (const control of controls) {
        const described =
          control.getAttribute('role') === 'radio' ||
          (control as HTMLInputElement).type === 'radio'
            ? control.closest('[role="radiogroup"]')!
            : control;
        expect(described).toHaveAccessibleDescription(
          expect.stringContaining(why),
        );
      }
    }

    /** Every control that changes something on the tab, once it is read. */
    const writeControls: Record<string, () => Promise<HTMLElement[]>> = {
      '': async () => [
        await screen.findByRole('button', { name: /^Remove payments-team/ }),
        screen.getByRole('button', { name: /^Remove jane@example.com/ }),
        screen.getByRole('radio', { name: 'A group' }),
        screen.getByRole('radio', { name: /A person/ }),
        screen.getByRole('textbox', { name: /Group/ }),
        screen.getByRole('button', { name: /Role$/ }),
        screen.getByRole('button', { name: 'Add group' }),
      ],
      '/models': async () => [
        await screen.findByRole('button', { name: 'Add model' }),
        screen.getByRole('button', {
          name: 'Replace the key of claude-sonnet',
        }),
        screen.getByRole('button', { name: 'Replace the key of gpt' }),
      ],
      '/connectors': async () => [
        await screen.findByRole('button', {
          name: 'Replace the credential of jira',
        }),
      ],
    };

    it.each([
      ['Members', ''],
      ['Models', '/models'],
      ['Connectors', '/connectors'],
    ])('turns every change on %s off and says why', async (_tab, path) => {
      await renderPage(path, PENDING_ERASE);

      expect(await screen.findByText(WHY)).toBeInTheDocument();
      const controls = await writeControls[path]();
      for (const control of controls) {
        expect(control).toBeDisabled();
      }
      expectEachNamesWhy(controls, WHY);
      // Erase now stays.
      expect(screen.getByRole('button', { name: 'Erase now' })).toBeEnabled();
    });

    it.each([
      ['Members', ''],
      ['Models', '/models'],
      ['Connectors', '/connectors'],
    ])(
      'turns every change on %s off while it is Erasing and says why',
      async (_tab, path) => {
        await renderPage(path, ERASING);

        expect(await screen.findByText('Erasing')).toBeInTheDocument();
        expect(screen.getByText(WHY_ERASING)).toBeInTheDocument();
        const controls = await writeControls[path]();
        for (const control of controls) {
          expect(control).toBeDisabled();
        }
        expectEachNamesWhy(controls, WHY_ERASING);
        expect(screen.queryByText(WHY)).not.toBeInTheDocument();
      },
    );

    it.each([
      ['Members', '', 'in git', IN_GIT],
      ['Models', '/models', 'in git', IN_GIT],
      ['Connectors', '/connectors', 'in git', IN_GIT],
      ['Members', '', 'Missing from git', MISSING_FROM_GIT],
      ['Models', '/models', 'Missing from git', MISSING_FROM_GIT],
      ['Connectors', '/connectors', 'Missing from git', MISSING_FROM_GIT],
    ])(
      'offers every change on %s while it is %s',
      async (_tab, path, _state, scenario) => {
        await renderPage(path, scenario);

        const controls = await writeControls[path]();
        for (const control of controls) {
          expect(control).toBeEnabled();
        }
        expect(screen.queryByText(WHY)).not.toBeInTheDocument();
        expect(screen.queryByText(WHY_ERASING)).not.toBeInTheDocument();
      },
    );

    it.each([
      ['Remove', '', /^Remove payments-team/, 'Pending erase'],
      ['Add a model', '/models', /^Add model$/, 'Pending erase'],
      ['Replace key', '/models', /^Replace the key of gpt$/, 'Pending erase'],
      [
        'Replace credential',
        '/connectors',
        /^Replace the credential of jira$/,
        'Pending erase',
      ],
      ['Remove', '', /^Remove payments-team/, 'Erasing'],
      ['Add a model', '/models', /^Add model$/, 'Erasing'],
      ['Replace key', '/models', /^Replace the key of gpt$/, 'Erasing'],
      [
        'Replace credential',
        '/connectors',
        /^Replace the credential of jira$/,
        'Erasing',
      ],
    ])(
      'closes an open %s dialog once the organization turns %s',
      async (_dialog, path, opener, state) => {
        const scenario: OrganizationsScenario = { ...IN_GIT };
        const { queryClient } = await renderPage(path, scenario);
        await userEvent.click(
          await screen.findByRole('button', { name: opener }),
        );
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        scenario.organization =
          state === 'Erasing'
            ? ERASING.organization
            : PENDING_ERASE.organization;
        await act(() =>
          queryClient.invalidateQueries({
            queryKey: musterOrganizationsQueryKey('gazelle'),
          }),
        );

        expect(
          await screen.findByText(state === 'Erasing' ? WHY_ERASING : WHY),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
      },
    );

    it('lists the egress policies on Pending erase, a tab with nothing to change', async () => {
      await renderPage('/egress', PENDING_ERASE);

      expect(await screen.findByText('payments-api')).toBeInTheDocument();
      expect(screen.getByText(WHY)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^(Add|Remove|Replace|Edit)/ }),
      ).not.toBeInTheDocument();
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

  it('hides key replacement for managed models', async () => {
    await renderPage('/models', {
      ...SCENARIO,
      models: {
        [PAYMENTS.namespace]: SCENARIO.models![PAYMENTS.namespace].map(
          model => ({
            ...model,
            managedBy: 'platform',
          }),
        ),
      },
    });
    await screen.findByRole('rowheader', { name: /claude-sonnet/ });
    expect(
      screen.queryByRole('button', { name: /Replace the key/ }),
    ).toBeNull();
  });

  it('closes the model dialog and refreshes after an immediate write', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('/models', {
      ...SCENARIO,
      modelKeyPresent: true,
    });
    await user.click(await screen.findByRole('button', { name: 'Add model' }));
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
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toolCalls(callTool, 'set_organization_model')).toHaveLength(1);
    expect(toolCalls(callTool, 'list_model_configs').length).toBeGreaterThan(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.modelCreated',
        attributes: {},
      }),
    );
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
      `/organizations/gazelle/org-acme/payments/credentials/${CREDENTIAL_OPERATION}`,
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  // The portal restarted and lost the keys it signed the session token
  // with: its backend refuses the token before muster-backend runs.
  it('says the portal session ended, in plain words, when the portal refuses the session token', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('/models', {
      ...SCENARIO,
      models: {},
    });
    const answer = callTool.getMockImplementation()!;
    callTool.mockImplementation(async (name, args, installation, options) => {
      if (name === 'x_agent-manager_set_organization_model') {
        throw new MusterUnauthorizedError(
          'Failed user token verification',
          undefined,
          undefined,
          'gazelle',
          'AuthenticationError',
        );
      }
      return answer(name, args, installation, options);
    });

    await user.click(await screen.findByRole('button', { name: 'Add model' }));
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

    expect(
      await within(dialog).findByText(/Your portal session ended/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Reload the page to sign in again/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/token verification/)).toBeNull();
  });

  it('says what is missing before it asks agent-manager for a model', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderPage('/models', {
      ...SCENARIO,
      models: {},
    });

    await user.click(await screen.findByRole('button', { name: 'Add model' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Continue to the key' }),
    );

    expect(
      await within(dialog).findByText('Enter a name for the model.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Enter the provider's model id."),
    ).toBeInTheDocument();
    expect(toolCalls(callTool, 'set_organization_model')).toEqual([]);
  });

  it('says so when agent-manager answers a credential request without its id', async () => {
    const user = userEvent.setup();
    await renderPage('/models', { ...SCENARIO, withoutOperation: true });

    await user.click(
      await screen.findByRole('button', { name: 'Replace the key of gpt' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));

    expect(
      await within(dialog).findByText(
        'agent-manager answered a credential request without its id.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
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

    // A rotation writes the Secret the model reads, never the model.
    await waitFor(() =>
      expect(toolCalls(callTool, 'replace_organization_credential')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          secret: 'tenant-credential-gpt',
          key: 'OPENAI_API_KEY',
          requestId: expect.any(String),
        },
      ]),
    );
    expect(toolCalls(callTool, 'set_organization_model')).toEqual([]);
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/credentials/${CREDENTIAL_OPERATION}`,
    );
  });

  it('says in plain words why a key cannot be replaced', async () => {
    const user = userEvent.setup();
    await renderPage('/models', {
      ...SCENARIO,
      replaceError:
        'conflict: ModelConfig other reads key apiKey of Secret tenant-credential-gpt, which a write of key OPENAI_API_KEY would drop: the Secret is written whole, holding that one key',
    });

    await user.click(
      await screen.findByRole('button', { name: 'Replace the key of gpt' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));

    expect(
      await within(dialog).findByText(
        /Another object reads a different key of the same Secret/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
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

    // Only the Secret and key: the connector, its URL and any egress
    // policy's destinations are not sent, so they cannot change.
    await waitFor(() =>
      expect(toolCalls(callTool, 'replace_organization_credential')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          secret: 'tenant-credential-jira',
          key: 'token',
          requestId: expect.any(String),
        },
      ]),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/credentials/${CREDENTIAL_OPERATION}`,
    );
  });

  it('offers one Replace per Secret of a connector with several', async () => {
    await renderPage('/connectors', {
      ...SCENARIO,
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
            {
              header: 'X-Api-Key',
              secret: 'tenant-credential-jira-key',
              key: 'token',
            },
          ],
        },
      ],
    });

    expect(
      await screen.findByRole('button', {
        name: 'Replace the credential of jira (Authorization)',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Replace the credential of jira (X-Api-Key)',
      }),
    ).toBeInTheDocument();
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

  describe('deleting the organization', () => {
    const MANAGED = {
      name: 'payments',
      parent: 'org-acme',
      displayName: 'Payments',
      namespace: PAYMENTS.namespace,
      harnesses: ['kagent'],
      workerReplicas: 3,
    };
    const ERASES = {
      namespace: PAYMENTS.namespace,
      agents: ['triage', 'refunds'],
      helmReleases: ['triage', 'refunds'],
      models: ['claude-sonnet'],
      connectors: ['jira'],
      egressPolicies: [],
      credentials: [
        'tenant-credential-claude-sonnet',
        'tenant-credential-jira',
      ],
      members: ['organization-admins', 'organization-editors'],
      sessions: [
        { agent: 'triage', running: 2, stopped: 1 },
        { agent: 'refunds', running: 0, stopped: 3 },
      ],
      kept: 'session tombstones stay in the agent runtime',
    };

    async function openDelete(scenario: OrganizationsScenario) {
      const rendered = await renderPage('', scenario);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Delete organization' }),
      );
      return { ...rendered, dialog: await screen.findByRole('dialog') };
    }

    it('lists what the delete erases, what stays and the running sessions', async () => {
      const { dialog } = await openDelete({
        ...SCENARIO,
        organization: MANAGED,
        erases: ERASES,
      });

      expect(
        await within(dialog).findByText('Agents: triage, refunds'),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'Credentials: tenant-credential-claude-sonnet, tenant-credential-jira',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText('Egress policies: none'),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'Kept: session tombstones stay in the agent runtime.',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/^Running sessions: 2 \(they stop/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText('triage: 2 sessions'),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText(/^refunds:/)).not.toBeInTheDocument();
    });

    it('says the running sessions are unknown when agent-manager could not count them', async () => {
      const { dialog } = await openDelete({
        ...SCENARIO,
        organization: MANAGED,
        erases: {
          ...ERASES,
          sessions: null,
          sessionsUnavailable: 'the agent runtime did not answer',
        },
      });

      expect(
        await within(dialog).findByText(
          /^Running sessions: unknown\. agent-manager could not count them: the agent runtime did not answer/,
        ),
      ).toBeInTheDocument();
    });

    it('erases only once the typed name matches parent/name', async () => {
      const { dialog, callTool } = await openDelete({
        ...SCENARIO,
        organization: MANAGED,
        erases: ERASES,
      });
      const confirm = within(dialog).getByRole('button', {
        name: 'Delete organization',
      });
      const field = await within(dialog).findByLabelText(
        'Type org-acme/payments to confirm',
      );

      expect(confirm).toBeDisabled();
      await userEvent.type(field, 'payments');
      expect(confirm).toBeDisabled();
      await userEvent.clear(field);
      await userEvent.type(field, 'org-acme/payments');
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      await waitFor(() =>
        expect(toolCalls(callTool, 'delete_organization')).toEqual([
          {
            namespace: 'org-acme',
            name: 'payments',
            confirm: 'org-acme/payments',
          },
        ]),
      );
      expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AgentPlatform.organizationErased' }),
      );
    });

    it("shows agent-manager's refusal in its own words", async () => {
      const { dialog } = await openDelete({
        ...SCENARIO,
        organization: MANAGED,
        erases: ERASES,
        deleteError:
          'forbidden: you may not delete agentplatformorganizations in org-acme',
      });
      await userEvent.type(
        await within(dialog).findByLabelText(
          'Type org-acme/payments to confirm',
        ),
        'org-acme/payments',
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Delete organization' }),
      );

      expect(
        await within(dialog).findByText(
          /you may not delete agentplatformorganizations in org-acme/,
        ),
      ).toBeInTheDocument();
    });

    it('opens the pull request for an organization applied from git, without a typed name', async () => {
      const { dialog, callTool } = await openDelete({
        ...SCENARIO,
        organization: {
          ...MANAGED,
          gitops: 'flux-giantswarm/agent-platform-organizations',
        },
        erases: ERASES,
      });

      expect(
        within(dialog).queryByLabelText('Type org-acme/payments to confirm'),
      ).not.toBeInTheDocument();
      const open = within(dialog).getByRole('button', {
        name: 'Open pull request',
      });
      await waitFor(() => expect(open).toBeEnabled());
      await userEvent.click(open);

      expect(
        await within(dialog).findByRole('link', {
          name: /Review pull request/,
        }),
      ).toHaveAttribute(
        'href',
        'https://github.com/giantswarm/gazelle-configs/pull/42',
      );
      expect(toolCalls(callTool, 'delete_organization')).toEqual([
        { namespace: 'org-acme', name: 'payments', mode: 'commit' },
      ]);
      expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AgentPlatform.organizationDeleteRequested',
        }),
      );
    });

    it('shows Pending erase from a newer listing after the delete dialog was opened and closed', async () => {
      const scenario: OrganizationsScenario = {
        ...SCENARIO,
        organization: {
          ...MANAGED,
          gitops: 'flux-giantswarm/agent-platform-organizations',
        },
        erases: ERASES,
      };
      const { dialog, queryClient } = await openDelete(scenario);
      const open = within(dialog).getByRole('button', {
        name: 'Open pull request',
      });
      await waitFor(() => expect(open).toBeEnabled());
      await userEvent.click(open);
      await within(dialog).findByRole('link', { name: /Review pull request/ });
      // The footer's Close, not the header's close icon.
      await userEvent.click(
        within(dialog)
          .getAllByRole('button', { name: 'Close' })
          .find(button => button.textContent === 'Close')!,
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );

      // The pull request merged: the listing now says Pending erase.
      scenario.organization = {
        ...scenario.organization!,
        orphaned: { status: 'True', reason: 'DeleteMerged' },
      };
      await act(() =>
        queryClient.invalidateQueries({
          queryKey: musterOrganizationsQueryKey('gazelle'),
        }),
      );

      expect(await screen.findByText('Pending erase')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Erase now' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete organization' }),
      ).not.toBeInTheDocument();
    });

    it("shows agent-manager's next step when the delete pull request is open already", async () => {
      const next =
        'the pull request that removes the organization from git is open: https://github.com/giantswarm/gazelle-configs/pull/42';
      const { dialog } = await openDelete({
        ...SCENARIO,
        organization: {
          ...MANAGED,
          gitops: 'flux-giantswarm/agent-platform-organizations',
        },
        erases: ERASES,
        deleteResult: { deleted: false, commit: undefined, next },
      });
      const open = within(dialog).getByRole('button', {
        name: 'Open pull request',
      });
      await waitFor(() => expect(open).toBeEnabled());
      await userEvent.click(open);

      expect(
        await within(dialog).findByText('Nothing was deleted'),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(next)).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Open pull request' }),
      ).not.toBeInTheDocument();
      expect(analyticsApi.captureEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AgentPlatform.organizationDeleteRequested',
        }),
      );
    });

    it("shows agent-manager's answer when the organization is being erased already", async () => {
      const next = 'the organization is being erased already (starting)';
      const { dialog } = await openDelete({
        ...SCENARIO,
        organization: MANAGED,
        erases: ERASES,
        deleteResult: { deleted: false, next },
      });
      await userEvent.type(
        await within(dialog).findByLabelText(
          'Type org-acme/payments to confirm',
        ),
        'org-acme/payments',
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Delete organization' }),
      );

      expect(await within(dialog).findByText(next)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('offers Erase now on Pending erase, with the typed name', async () => {
      const { callTool } = await renderPage('', {
        ...SCENARIO,
        organization: {
          ...MANAGED,
          gitops: 'flux-giantswarm/agent-platform-organizations',
          orphaned: { status: 'True', reason: 'DeleteMerged' },
        },
        erases: ERASES,
      });

      expect(await screen.findByText('Pending erase')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete organization' }),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Erase now' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        await within(dialog).findByLabelText(
          'Type org-acme/payments to confirm',
        ),
        'org-acme/payments',
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Erase organization' }),
      );

      await waitFor(() =>
        expect(toolCalls(callTool, 'delete_organization')).toEqual([
          {
            namespace: 'org-acme',
            name: 'payments',
            confirm: 'org-acme/payments',
            mode: 'commit',
          },
        ]),
      );
    });

    it('offers neither Delete nor Erase now on Missing from git', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: {
          ...MANAGED,
          gitops: 'flux-giantswarm/agent-platform-organizations',
          orphaned: { status: 'True', reason: 'MissingFromGit' },
        },
      });

      expect(await screen.findByText('Missing from git')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Erase now' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete organization' }),
      ).not.toBeInTheDocument();
    });

    it('offers no delete to a person who does not manage the organization', async () => {
      await renderPage('', SCENARIO);

      expect(await screen.findByText('payments-team')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete organization' }),
      ).not.toBeInTheDocument();
    });

    it('offers no delete to a person who reads the organization but does not manage it', async () => {
      await renderPage('', {
        ...SCENARIO,
        organization: MANAGED,
        manage: false,
        erases: ERASES,
      });

      expect(
        await screen.findByRole('heading', { name: 'Payments' }),
      ).toBeInTheDocument();
      expect(await screen.findByText('payments-team')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete organization' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('what the person may do', () => {
    const MEMBER_ONLY = {
      ...SCENARIO,
      access: { rolebindings: false, modelconfigs: false, secrets: false },
    };

    it('shows a member the status agent-manager lists, without reading the organization whole', async () => {
      const { callTool } = await renderPage('', {
        ...MEMBER_ONLY,
        memberStatus: {
          orphaned: { status: 'True', reason: 'MissingFromGit' },
        },
      });

      expect(await screen.findByText('Missing from git')).toBeInTheDocument();
      expect(toolCalls(callTool, 'get_organization')).toHaveLength(0);
    });

    it('offers a member no change to the members', async () => {
      await renderPage('', MEMBER_ONLY);

      expect(await screen.findByText('payments-team')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Remove / }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Add a member')).not.toBeInTheDocument();
    });

    it('offers a member no model or key change', async () => {
      await renderPage('/models', MEMBER_ONLY);

      expect(await screen.findByText('claude-sonnet')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add model' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Replace the key of / }),
      ).not.toBeInTheDocument();
    });

    it('offers a member no credential change on a connector', async () => {
      await renderPage('/connectors', MEMBER_ONLY);

      expect(await screen.findByText('jira')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Replace the credential of / }),
      ).not.toBeInTheDocument();
    });

    it('offers an organization admin who does not manage the organization its changes', async () => {
      const { callTool } = await renderPage('/models', SCENARIO);

      expect(
        await screen.findByRole('button', { name: 'Add model' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', {
          name: 'Replace the key of claude-sonnet',
        }),
      ).toBeInTheDocument();
      expect(toolCalls(callTool, 'get_organization')).toHaveLength(0);
    });

    it('names an organization the person manages without being a member from the listing alone', async () => {
      const { callTool } = await renderPage('', {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: {
          name: 'payments',
          parent: 'org-acme',
          displayName: 'Payments',
          namespace: PAYMENTS.namespace,
          harnesses: ['kagent'],
          workerReplicas: 3,
        },
      });

      expect(
        await screen.findByRole('heading', { name: 'Payments' }),
      ).toBeInTheDocument();
      expect(toolCalls(callTool, 'get_organization')).toHaveLength(0);
    });

    // The operator never created its namespace: agent-manager still deletes
    // it by its parent namespace and name, and previews no erasure.
    const WITHOUT_NAMESPACE = {
      name: 'payments',
      parent: 'org-acme',
      displayName: 'Payments',
      harnesses: ['kagent'],
      workerReplicas: 0,
    };

    it('deletes an organization the person manages that has no namespace yet', async () => {
      const { callTool } = await renderPage('', {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: WITHOUT_NAMESPACE,
      });

      expect(
        await screen.findByText('Payments has no namespace yet'),
      ).toBeInTheDocument();
      await userEvent.click(
        await screen.findByRole('button', { name: 'Delete organization' }),
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        await within(dialog).findByText(
          /has no organization namespace yet, so there are no agents/,
        ),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText(/^Running sessions/)).toBeNull();
      const confirm = within(dialog).getByRole('button', {
        name: 'Delete organization',
      });
      expect(confirm).toBeDisabled();
      await userEvent.type(
        within(dialog).getByLabelText('Type org-acme/payments to confirm'),
        'org-acme/payments',
      );
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      await waitFor(() =>
        expect(toolCalls(callTool, 'delete_organization')).toEqual([
          {
            namespace: 'org-acme',
            name: 'payments',
            confirm: 'org-acme/payments',
          },
        ]),
      );
    });

    it('opens the pull request for one applied from git that has no namespace yet', async () => {
      const { callTool } = await renderPage('', {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: {
          ...WITHOUT_NAMESPACE,
          gitops: 'flux-giantswarm/agent-platform-organizations',
        },
      });

      await userEvent.click(
        await screen.findByRole('button', { name: 'Delete organization' }),
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        await within(dialog).findByRole('button', {
          name: 'Open pull request',
        }),
      );

      await waitFor(() =>
        expect(toolCalls(callTool, 'delete_organization')).toEqual([
          { namespace: 'org-acme', name: 'payments', mode: 'commit' },
        ]),
      );
    });

    it('offers no Delete to a person who reads one without a namespace but does not manage it', async () => {
      await renderPage('', {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: WITHOUT_NAMESPACE,
        manage: false,
      });

      expect(
        await screen.findByText('Payments has no namespace yet'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete organization' }),
      ).toBeNull();
    });

    it('offers Erase now on Pending erase for one without a namespace', async () => {
      const { callTool } = await renderPage('', {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: {
          ...WITHOUT_NAMESPACE,
          gitops: 'flux-giantswarm/agent-platform-organizations',
          orphaned: { status: 'True', reason: 'DeleteMerged' },
        },
      });

      expect(await screen.findByText('Pending erase')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Erase now' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        await within(dialog).findByLabelText(
          'Type org-acme/payments to confirm',
        ),
        'org-acme/payments',
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Erase organization' }),
      );

      await waitFor(() =>
        expect(toolCalls(callTool, 'delete_organization')).toEqual([
          {
            namespace: 'org-acme',
            name: 'payments',
            confirm: 'org-acme/payments',
            mode: 'commit',
          },
        ]),
      );
    });

    it('says it is erased when it is gone from the list right after its delete', async () => {
      const scenario: OrganizationsScenario = {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: WITHOUT_NAMESPACE,
      };
      await renderPage('', scenario);

      await userEvent.click(
        await screen.findByRole('button', { name: 'Delete organization' }),
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        await within(dialog).findByLabelText(
          'Type org-acme/payments to confirm',
        ),
        'org-acme/payments',
      );
      // No namespace to erase: the operator is done before the list is read
      // again, which then no longer lists it.
      scenario.deleteResult = { organization: WITHOUT_NAMESPACE };
      const confirm = within(dialog).getByRole('button', {
        name: 'Delete organization',
      });
      await waitFor(() => expect(confirm).toBeEnabled());
      delete scenario.organization;
      await userEvent.click(confirm);

      // Gone from the list, it is named by its name, as its address says.
      expect(await screen.findByText('payments is erased')).toBeInTheDocument();
      expect(screen.queryByText(/You are not a member/)).toBeNull();
    });

    it('says an organization the person manages has no namespace yet, rather than that they are no member', async () => {
      await renderPage('', {
        ...SCENARIO,
        mine: { organizations: [] },
        organization: {
          name: 'payments',
          parent: 'org-acme',
          displayName: 'Payments',
          harnesses: ['kagent'],
          workerReplicas: 0,
        },
      });

      expect(
        await screen.findByText('Payments has no namespace yet'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/You are not a member/),
      ).not.toBeInTheDocument();
    });
  });

  it('says the organizations could not be read, rather than that the person is no member, and reads them again', async () => {
    const { callTool } = await renderPage('', {
      ...SCENARIO,
      mineFailures: 1,
    });

    expect(
      await screen.findByText('Could not read your organizations on gazelle'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/You are not a member/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));

    expect(await screen.findByText('payments-team')).toBeInTheDocument();
    expect(toolCalls(callTool, 'list_organizations')).toHaveLength(2);
  });

  it('says the person is no member of an organization agent-manager does not list for them', async () => {
    await renderPage('', { ...SCENARIO, mine: { organizations: [] } });

    expect(
      await screen.findByText('You are not a member of payments'),
    ).toBeInTheDocument();
  });
});
