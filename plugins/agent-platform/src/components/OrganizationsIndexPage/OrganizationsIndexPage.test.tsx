import { identityApiRef } from '@backstage/frontend-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
/* eslint-disable @backstage/no-mixed-plugin-imports -- The provider reads organizations through the Muster API, and the person's Environments setting from gs. */
import {
  musterApiRef,
  MusterUnauthorizedError,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import {
  mutedInstallationsApiRef,
  type MutedInstallationsApi,
} from '@giantswarm/backstage-plugin-gs';
/* eslint-enable @backstage/no-mixed-plugin-imports */
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
  PageHeaderActionsProvider,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';
import { OrganizationsIndexPage } from './OrganizationsIndexPage';

/** The person's Environments setting, with the installations turned off. */
function fakeEnvironments(off: string[]) {
  let muted = [...off].sort();
  const listeners = new Set<(next: string[]) => void>();
  const api = {
    getSnapshot: () => [...muted],
    muted$: () => ({
      subscribe: (listener: (next: string[]) => void) => {
        listeners.add(listener);
        return { unsubscribe: () => listeners.delete(listener) };
      },
    }),
  } as unknown as MutedInstallationsApi;
  const turnOn = (installation: string) => {
    muted = muted.filter(name => name !== installation);
    listeners.forEach(listener => listener([...muted]));
  };
  return { api, turnOn };
}

/**
 * muster lists `names`; each installation's server list answers as
 * `servers` says: agent-manager listed, not listed, or the error thrown.
 */
function withInstallations(
  names: string[],
  servers: (installation: string) => 'agent-manager' | 'none' | Error,
) {
  return (api: MusterApi) => {
    jest.spyOn(api, 'listInstallations').mockResolvedValue({
      installations: names.map(name => ({ name, requiresAuth: true })),
    });
    jest
      .spyOn(api, 'listServers')
      .mockImplementation(async (installation?: string) => {
        const answer = servers(installation ?? '');
        if (answer instanceof Error) {
          throw answer;
        }
        return {
          mcpServers: answer === 'none' ? [] : [{ name: 'agent-manager' }],
        } as Awaited<ReturnType<MusterApi['listServers']>>;
      });
  };
}

/** muster's answer when its installation's muster did not answer. */
function didNotAnswer(installation: string) {
  return Object.assign(new Error(`${installation} did not answer`), {
    status: 503,
  });
}

/** The warning cards on the page (bui's Alert has no role of its own). */
function warnings(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.bui-Alert'));
}

/** agent-manager's answer on graveler when the person's sign-in to it is gone. */
const SIGN_IN_GONE =
  "auth_required: server 'agent-manager' requires authentication; sign in to it to use its tools.";

/**
 * gazelle answers with payments; graveler serves organizations too, but its
 * `list_organizations` is refused for a missing sign-in to agent-manager,
 * which signs in through muster's own session there (SSO), muster
 * reporting it as `ssoStatus`.
 */
function gravelerSignInLost(ssoStatus: Record<string, unknown> = {}) {
  return (api: MusterApi) => {
    withInstallations(['gazelle', 'graveler'], () => 'agent-manager')(api);
    const answer = jest.mocked(api.callTool).getMockImplementation()!;
    jest
      .mocked(api.callTool)
      .mockImplementation(async (name, args, installation, options) => {
        if (
          installation === 'graveler' &&
          name === 'x_agent-manager_list_organizations'
        ) {
          throw new MusterUnauthorizedError(
            SIGN_IN_GONE,
            'server_sign_in_required',
            'agent-manager',
            'graveler',
          );
        }
        return answer(name, args, installation, options);
      });
    Object.assign(api, {
      getAuthStatus: jest.fn(async () => ({
        servers: [
          {
            name: 'agent-manager',
            status: 'auth_required',
            token_exchange_enabled: true,
            ...ssoStatus,
          },
        ],
      })),
      listConnectorNames: jest.fn(async () => ({ servers: [] })),
    });
  };
}

/** Opens the disclosure of the one installation not checked, and its row. */
async function openTheOneUnchecked(): Promise<HTMLElement> {
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Organizations could not be checked on 1 installation',
    }),
  );
  const list = screen.getByRole('list', { name: 'Installations not checked' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  return list;
}

const PAYMENTS = {
  mine: {
    organizations: [
      {
        namespace: 'agents-payments-x7k2q',
        organization: 'payments',
      },
    ],
  },
};

async function renderList(
  scenario: OrganizationsScenario,
  configure?: (api: MusterApi) => void,
  environments?: MutedInstallationsApi,
  signOut: () => Promise<void> = jest.fn(async () => {}),
) {
  const { api } = fakeOrganizationsMuster(scenario);
  configure?.(api);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [kubernetesApiRef, fakeOrganizationAccess(scenario.access)],
        [externalUrlConsentApiRef, new ExternalUrlConsentManager(jest.fn())],
        [identityApiRef, { signOut } as unknown as typeof identityApiRef.T],
        ...(environments
          ? [[mutedInstallationsApiRef, environments] as const]
          : []),
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <OrganizationDirectoryProvider>
          <PageHeaderActionsProvider>
            <OrganizationsIndexPage />
          </PageHeaderActionsProvider>
        </OrganizationDirectoryProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/organizations': organizationsRouteRef } },
  );
  return api;
}

describe('OrganizationsIndexPage', () => {
  it('reports unavailable only after agent-manager answers without organization support', async () => {
    await renderList({}, api => {
      jest.spyOn(api, 'callTool').mockResolvedValue({
        capabilities: { organizations: false },
      });
    });

    expect(
      await screen.findByText('Organizations are not available here'),
    ).toBeInTheDocument();
    expect(warnings()).toHaveLength(0);
  });

  it('shows a failed installation inventory instead of claiming organizations are unavailable', async () => {
    await renderList({}, api => {
      jest
        .spyOn(api, 'listInstallations')
        .mockRejectedValue(new Error('Portal inventory is unavailable.'));
    });

    expect(
      await screen.findByText('Portal inventory is unavailable.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organizations are not available here'),
    ).not.toBeInTheDocument();
  });

  it('puts the installations it could not check behind one closed line, under the organizations', async () => {
    const failing = Array.from({ length: 14 }, (_, i) => `remote-${i + 1}`);
    // remote-1 answers once it is asked again.
    let remoteOneUp = false;
    const api = await renderList(
      PAYMENTS,
      withInstallations(['gazelle', ...failing], installation => {
        if (installation === 'gazelle') {
          return 'agent-manager';
        }
        return installation === 'remote-1' && remoteOneUp
          ? 'none'
          : didNotAnswer(installation);
      }),
    );

    expect(
      await screen.findByRole('row', { name: /payments/ }),
    ).toBeInTheDocument();
    const line = screen.getByRole('button', {
      name: 'Organizations could not be checked on 14 installations',
    });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(warnings()).toHaveLength(0);

    await userEvent.click(line);

    expect(line).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', {
      name: 'Installations not checked',
    });
    const first = within(list).getAllByRole('listitem')[0];
    expect(within(first).getByText('remote-1')).toBeInTheDocument();
    expect(
      within(first).getByText('Muster on this installation did not answer.'),
    ).toBeInTheDocument();

    remoteOneUp = true;
    await userEvent.click(
      within(first).getByRole('button', { name: 'Check remote-1 again' }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'Organizations could not be checked on 13 installations',
      }),
    ).toBeInTheDocument();
    expect(within(list).queryByText('remote-1')).not.toBeInTheDocument();
    expect(api.listServers).toHaveBeenCalledWith('remote-1');
  });

  it('keeps the answer of a connector that is not connected, which no sign-in fixes', async () => {
    await renderList({}, api => {
      jest
        .spyOn(api, 'callTool')
        .mockRejectedValue(new Error('server agent-manager not connected'));
    });

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Organizations could not be checked on 1 installation',
      }),
    );

    expect(
      screen.getByText(/server agent-manager not connected/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/You have not signed in to the/),
    ).not.toBeInTheDocument();
  });

  it('shows an installation whose SSO connector lost its sign-in once, in the list, with the portal sign-out', async () => {
    const signOut = jest.fn(async () => {});
    await renderList(PAYMENTS, gravelerSignInLost(), undefined, signOut);

    expect(
      await screen.findByRole('row', { name: /payments/ }),
    ).toBeInTheDocument();
    // gazelle answered: no warning, graveler only behind the quiet line.
    expect(warnings()).toHaveLength(0);
    expect(
      screen.queryByRole('heading', { name: 'graveler' }),
    ).not.toBeInTheDocument();
    const list = await openTheOneUnchecked();
    expect(
      await within(list).findByText(
        /has no valid sign-in for agent-manager now\. .* sign out of the portal and sign in again, then check again\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_GONE)).not.toBeInTheDocument();
    expect(
      within(list).queryByText(/nothing to sign in to/),
    ).not.toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'Check graveler again' }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(list).getByRole('button', { name: 'Sign out of the portal' }),
    );
    expect(signOut).toHaveBeenCalled();
  });

  it('lets the explanation of an SSO connector that refused the sign-in stand alone', async () => {
    await renderList(
      PAYMENTS,
      gravelerSignInLost({ sso_attempt_failed: true }),
    );

    const list = await openTheOneUnchecked();
    expect(
      await within(list).findByText(/An administrator needs to add/),
    ).toBeInTheDocument();
    expect(
      within(list).queryByText(/You have not signed in to the/),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByRole('button', { name: /Sign (in|out)/ }),
    ).not.toBeInTheDocument();
  });

  it('does not call organizations unavailable where an installation serves them and only their read failed', async () => {
    await renderList(
      { mine: { organizations: [] }, mineFailures: 1 },
      withInstallations(['gazelle', 'ozone'], installation =>
        installation === 'ozone' ? 'none' : 'agent-manager',
      ),
    );

    expect(
      await screen.findByText('Your organizations could not be read'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organizations are not available here'),
    ).not.toBeInTheDocument();
    expect(warnings()).toHaveLength(0);
    const list = await openTheOneUnchecked();
    expect(within(list).getByText('gazelle')).toBeInTheDocument();
  });

  it('leaves out an installation that answered without organizations', async () => {
    await renderList(
      PAYMENTS,
      withInstallations(['gazelle', 'quiet', 'remote'], installation => {
        if (installation === 'quiet') {
          return 'none';
        }
        return installation === 'remote'
          ? didNotAnswer(installation)
          : 'agent-manager';
      }),
    );

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Organizations could not be checked on 1 installation',
      }),
    );

    const list = screen.getByRole('list', {
      name: 'Installations not checked',
    });
    expect(within(list).getByText('remote')).toBeInTheDocument();
    expect(within(list).queryByText('quiet')).not.toBeInTheDocument();
  });

  it('warns once, saying where to sign in, when no installation could be checked', async () => {
    await renderList(
      {},
      withInstallations(
        ['gazelle', 'graveler', 'remote'],
        () => new MusterUnauthorizedError('Unauthorized', 'token_missing'),
      ),
    );

    expect(
      await screen.findByText(
        'Could not check any installation for organizations',
      ),
    ).toBeInTheDocument();
    expect(warnings()).toHaveLength(1);
    expect(
      within(warnings()[0]).getByText(
        /Sign in to Muster for the installation you use/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organizations are not available here'),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Organizations could not be checked on 3 installations',
      }),
    );
    expect(
      screen.getAllByText(
        'You are not signed in to Muster for this installation.',
      ),
    ).toHaveLength(3);
  });

  it('asks only the installations the person turned on, and one turned on later', async () => {
    const known = Array.from({ length: 26 }, (_, i) => `inst-${i + 1}`);
    const environments = fakeEnvironments(
      known.filter(name => name !== 'inst-1' && name !== 'inst-2'),
    );
    const api = await renderList(
      {},
      withInstallations(known, installation =>
        installation === 'inst-1' || installation === 'inst-2'
          ? 'agent-manager'
          : didNotAnswer(installation),
      ),
      environments.api,
    );

    expect(
      await screen.findByText('You belong to no organization'),
    ).toBeInTheDocument();
    const asked = () =>
      new Set(jest.mocked(api.listServers).mock.calls.map(([name]) => name));
    expect(asked()).toEqual(new Set(['inst-1', 'inst-2']));
    expect(warnings()).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: /could not be checked/ }),
    ).not.toBeInTheDocument();

    act(() => environments.turnOn('inst-3'));

    expect(
      await screen.findByRole('button', {
        name: 'Organizations could not be checked on 1 installation',
      }),
    ).toBeInTheDocument();
    expect(asked()).toEqual(new Set(['inst-1', 'inst-2', 'inst-3']));
  });

  it("lists the person's organizations, each linking to its page", async () => {
    await renderList({
      mine: {
        organizations: [
          {
            namespace: 'agents-payments-x7k2q',
            organization: 'payments',
          },
        ],
      },
    });

    // A bui list row is the link: it carries its target as `data-href`.
    expect(
      await screen.findByRole('row', { name: /payments/ }),
    ).toHaveAttribute('data-href', '/organizations/gazelle/payments');
    // The name is a link a person can see, to the same page.
    expect(screen.getByRole('link', { name: 'payments' })).toHaveAttribute(
      'href',
      '/organizations/gazelle/payments',
    );
  });

  it('marks an organization the operator has not reported ready', async () => {
    await renderList({
      mine: { organizations: [] },
      organization: {
        name: 'payments',
        harnesses: [],
        workerReplicas: 1,
        ready: { status: 'False', reason: 'NamespacePending' },
      },
    });

    expect(
      await screen.findByRole('row', { name: /payments/ }),
    ).toHaveTextContent(/not ready yet/);
  });

  it('offers Create organization only where the person may create an Organization', async () => {
    await renderList({
      mine: { organizations: [] },
      access: { organizations: false },
    });

    expect(
      await screen.findByText('You belong to no organization'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create organization' }),
    ).not.toBeInTheDocument();
  });

  it('tells a person in no organization who can add them, in agent-manager’s words', async () => {
    await renderList({
      mine: {
        organizations: [],
        none: 'you belong to no organization: an admin of an organization adds you (add_organization_member), or someone with agent-platform:organizations-admin creates one with you as its first admin',
      },
    });

    expect(
      await screen.findByText('You belong to no organization'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^You belong to no organization: an admin of an organization adds you/,
      ),
    ).toBeInTheDocument();
  });
});
