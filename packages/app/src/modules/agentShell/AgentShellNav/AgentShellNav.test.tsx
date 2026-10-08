import { SidebarPinStateProvider } from '@backstage/core-components';
import {
  createExtensionTester,
  mockApis,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import {
  NavContentBlueprint,
  NavContentNavItems,
} from '@backstage/plugin-app-react';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { agentShellNav } from '../navExtension';

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    agentPlatformPlugin: {
      routes: { sessions: createRouteRef(), usage: createRouteRef() },
    },
    RecentSessions: () => <div data-testid="recent-sessions" />,
  };
});

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ClusterAccessConnector: () => <div data-testid="cluster-access-connector" />,
}));

const navItems = {
  take: () => undefined,
  rest: () => [],
  clone: () => navItems,
  withComponent: () => ({ take: () => null, rest: () => [] }),
} as unknown as NavContentNavItems;

const signOut = jest.fn().mockResolvedValue(undefined);

async function renderNav({
  bound = true,
  isPinned = true,
  path = '/',
}: { bound?: boolean; isPinned?: boolean; path?: string } = {}) {
  const Content = createExtensionTester(agentShellNav).get(
    NavContentBlueprint.dataRefs.component,
  );
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned, toggleSidebarPinState: () => {}, isMobile: false }}
    >
      <Content navItems={navItems} items={[]} />
    </SidebarPinStateProvider>,
    {
      initialRouteEntries: [path],
      apis: [
        [
          identityApiRef,
          mockApis.identity.mock({
            getProfileInfo: async () => ({
              displayName: 'Jane Doe',
              email: 'jane@example.com',
            }),
            signOut,
          }),
        ],
      ],
      ...(bound && {
        mountedRoutes: {
          '/agent-platform/sessions': agentPlatformPlugin.routes.sessions,
          '/agent-platform/usage': agentPlatformPlugin.routes.usage,
        },
      }),
    },
  );
}

function railLinks() {
  const nav = screen.getByRole('navigation', { name: 'Main' });
  return within(nav)
    .getAllByRole('link')
    .filter(link => link.textContent !== 'Skip to content')
    .map(link => [link.textContent, link.getAttribute('href')]);
}

beforeEach(() => {
  signOut.mockClear();
});

describe('AgentShellNav', () => {
  it('renders the rail items, the search placeholder and the recent sessions', async () => {
    await renderNav();

    expect(railLinks()).toEqual([
      ['New session', '/'],
      ['Sessions', '/agent-platform/sessions'],
      ['Customize', '/customize'],
      ['Usage', '/agent-platform/usage'],
    ]);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeDisabled();
    expect(screen.getByTestId('recent-sessions')).toBeInTheDocument();
  });

  it('puts the search right after New session, the recent sessions after the items', async () => {
    await renderNav();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const order = [
      within(nav).getByRole('link', { name: 'New session' }),
      within(nav).getByRole('searchbox', { name: 'Search' }),
      within(nav).getByRole('link', { name: 'Sessions' }),
      within(nav).getByRole('link', { name: 'Usage' }),
      within(nav).getByTestId('recent-sessions'),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('mounts the cluster-access connector that the installation inventory waits on', async () => {
    await renderNav();
    expect(screen.getByTestId('cluster-access-connector')).toBeInTheDocument();
  });

  it('hides the items whose route is not bound', async () => {
    await renderNav({ bound: false });

    expect(railLinks()).toEqual([
      ['New session', '/'],
      ['Customize', '/customize'],
    ]);
  });

  it('highlights the item of the current location', async () => {
    await renderNav({ path: '/agent-platform/sessions/gazelle/abc' });

    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'New session' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('opens with a skip link to the content', async () => {
    const user = userEvent.setup();
    await renderNav();

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#content');
  });

  it('collapses to icons without search or recent sessions when unpinned', async () => {
    await renderNav({ isPinned: false });

    expect(screen.getByRole('link', { name: 'Customize' })).toBeInTheDocument();
    expect(screen.queryByText('Customize')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-sessions')).not.toBeInTheDocument();
  });

  it('opens the profile menu with the user name, settings links and sign out', async () => {
    await renderNav();

    const trigger = screen.getByRole('button', {
      name: 'Profile and settings',
    });
    expect(await within(trigger).findByText('Jane Doe')).toBeInTheDocument();

    await userEvent.click(trigger);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Jane Doe')).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Profile and settings' }),
    ).toHaveAttribute('href', '/settings');
    expect(
      within(menu).getByRole('menuitem', { name: 'Feature flags' }),
    ).toHaveAttribute('href', '/settings/feature-flags');

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Sign out' }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
