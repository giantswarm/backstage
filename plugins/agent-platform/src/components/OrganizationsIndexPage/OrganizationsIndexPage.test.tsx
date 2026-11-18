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
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
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

const PAYMENTS = {
  mine: {
    organizations: [
      {
        namespace: 'agents-payments-x7k2q',
        organization: 'payments',
        parent: 'org-acme',
      },
    ],
  },
};

async function renderList(
  scenario: OrganizationsScenario,
  configure?: (api: MusterApi) => void,
  environments?: MutedInstallationsApi,
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
    await renderList(
      PAYMENTS,
      withInstallations(['gazelle', ...failing], installation =>
        installation === 'gazelle'
          ? 'agent-manager'
          : didNotAnswer(installation),
      ),
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
    expect(
      within(first).getByRole('button', { name: 'Check remote-1 again' }),
    ).toBeInTheDocument();
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
            parent: 'org-acme',
          },
        ],
      },
    });

    // A bui list row is the link: it carries its target as `data-href`.
    expect(
      await screen.findByRole('row', { name: /payments/ }),
    ).toHaveAttribute('data-href', '/organizations/gazelle/org-acme/payments');
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
