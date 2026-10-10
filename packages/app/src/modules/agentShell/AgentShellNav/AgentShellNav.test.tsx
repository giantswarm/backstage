import type { ReactNode } from 'react';
import { SidebarPinStateProvider } from '@backstage/core-components';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import { customizeRouteRef } from '../routes';
import { AgentShellNav } from './AgentShellNav';

const mockOpenPalette = jest.fn();

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    AGENT_SHELL_FLAG: 'agent-platform-shell',
    CommandPalette: ({
      renderTrigger,
    }: {
      renderTrigger: (open: () => void) => ReactNode;
    }) => <>{renderTrigger(mockOpenPalette)}</>,
    agentPlatformPlugin: {
      routes: {
        sessions: createRouteRef(),
        usage: createRouteRef(),
        agents: createRouteRef(),
        models: createRouteRef(),
      },
    },
    RecentSessions: ({ shellRail }: { shellRail?: boolean }) => (
      <div data-testid="recent-sessions" data-shell-rail={String(shellRail)} />
    ),
    SessionNotificationsBell: ({
      compact,
      className,
    }: {
      compact?: boolean;
      className?: string;
    }) => (
      <button
        type="button"
        data-testid="session-notifications-bell"
        data-compact={String(compact)}
        className={className}
      >
        Notifications
      </button>
    ),
  };
});

jest.mock('@giantswarm/backstage-plugin-muster', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    __esModule: true,
    default: {
      routes: { mcpServers: createRouteRef(), workflows: createRouteRef() },
    },
  };
});

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ClusterAccessConnector: () => <div data-testid="cluster-access-connector" />,
}));

const signOut = jest.fn().mockResolvedValue(undefined);

async function renderNav({
  bound = true,
  isPinned = true,
  isMobile = false,
  path = '/',
  profile = { displayName: 'Jane Doe', email: 'jane@example.com' },
}: {
  profile?: { displayName?: string; email?: string };
  bound?: boolean;
  isPinned?: boolean;
  isMobile?: boolean;
  path?: string;
} = {}) {
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned, toggleSidebarPinState: () => {}, isMobile }}
    >
      <AgentShellNav />
    </SidebarPinStateProvider>,
    {
      initialRouteEntries: [path],
      apis: [
        [
          identityApiRef,
          mockApis.identity.mock({
            getProfileInfo: async () => profile,
            signOut,
          }),
        ],
      ],
      ...(bound && {
        mountedRoutes: {
          '/agent-platform/sessions': agentPlatformPlugin.routes.sessions,
          '/customize': customizeRouteRef,
          '/agent-platform/usage': agentPlatformPlugin.routes.usage,
          '/agent-platform/agents': agentPlatformPlugin.routes.agents,
          '/agent-platform/models': agentPlatformPlugin.routes.models,
          '/agent-platform/mcp-servers': musterPlugin.routes.mcpServers,
          '/agent-platform/workflows': musterPlugin.routes.workflows,
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
  mockOpenPalette.mockClear();
});

describe('AgentShellNav', () => {
  it('renders the rail items, the search item and the recent sessions', async () => {
    await renderNav();

    expect(railLinks()).toEqual([
      ['Agent Platform', '/'],
      ['New session', '/'],
      ['Customize', '/customize'],
      ['Usage', '/agent-platform/usage'],
      ['Platform Portal', '/clusters'],
    ]);
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByTestId('recent-sessions')).toHaveAttribute(
      'data-shell-rail',
      'true',
    );
  });

  it('opens the command palette from the rail Search item', async () => {
    await renderNav();

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(mockOpenPalette).toHaveBeenCalledTimes(1);
  });

  it('keeps a Search item in the mobile bar, opening the palette', async () => {
    await renderNav({ isMobile: true });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    await userEvent.click(within(nav).getByRole('button', { name: 'Search' }));
    expect(mockOpenPalette).toHaveBeenCalledTimes(1);
  });

  it('leaves Platform and Developers out of the rail', async () => {
    await renderNav();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Platform')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Developers')).not.toBeInTheDocument();
  });

  it('keeps a Sessions item in the mobile bar, which lists no recent sessions', async () => {
    await renderNav({ isMobile: true });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .filter(link => link.textContent !== 'Skip to content')
        .map(link => [
          link.getAttribute('aria-label'),
          link.getAttribute('href'),
        ]),
    ).toEqual([
      ['New session', '/'],
      ['Sessions', '/agent-platform/sessions'],
      ['Customize', '/customize'],
      ['Usage', '/agent-platform/usage'],
      ['Platform Portal', '/clusters'],
    ]);
    expect(screen.queryByTestId('recent-sessions')).not.toBeInTheDocument();
  });

  it('puts the search right after New session, the recent sessions after the items', async () => {
    await renderNav();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const order = [
      within(nav).getByRole('link', { name: 'New session' }),
      within(nav).getByRole('button', { name: 'Search' }),
      within(nav).getByRole('link', { name: 'Customize' }),
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

  it('puts exactly one notification bell in the rail footer, after the bottom items', async () => {
    await renderNav();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    // Exactly one: the bell must never appear both as a nav item and in the
    // footer, nor once per list.
    const bells = within(nav).getAllByTestId('session-notifications-bell');
    expect(bells).toHaveLength(1);
    const bell = bells[0];
    expect(bell).toHaveAttribute('data-compact', 'false');
    const portal = within(nav).getByRole('link', { name: 'Platform Portal' });
    expect(
      portal.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // And no second "Notifications" entry anywhere in the rail besides it.
    expect(within(nav).getAllByText('Notifications')).toHaveLength(1);
  });

  it('keeps the bell, compacted and alone, in the collapsed rail', async () => {
    await renderNav({ isPinned: false });
    const bells = screen.getAllByTestId('session-notifications-bell');
    expect(bells).toHaveLength(1);
    expect(bells[0]).toHaveAttribute('data-compact', 'true');
  });

  it('shows exactly one bell in the mobile bar', async () => {
    await renderNav({ isMobile: true });
    const bells = screen.getAllByTestId('session-notifications-bell');
    expect(bells).toHaveLength(1);
    expect(bells[0]).toHaveAttribute('data-compact', 'true');
  });

  it('hides the items whose route is not bound', async () => {
    await renderNav({ bound: false });

    expect(railLinks()).toEqual([
      ['Agent Platform', '/'],
      ['New session', '/'],
      ['Platform Portal', '/clusters'],
    ]);
  });

  it('cross-links to the classic Platform Portal in a new tab', async () => {
    await renderNav();

    const portal = screen.getByRole('link', { name: 'Platform Portal' });
    expect(portal).toHaveAttribute('href', '/clusters');
    expect(portal).toHaveAttribute('target', '_blank');
    // The rail's in-shell items stay in the same tab.
    expect(
      screen.getByRole('link', { name: 'New session' }),
    ).not.toHaveAttribute('target');
  });

  it('links the logo to the home page', async () => {
    await renderNav();

    const logo = screen.getByRole('link', { name: 'Agent Platform' });
    expect(logo).toHaveAttribute('href', '/');
    expect(within(logo).getByText('Agent Platform')).toBeInTheDocument();
  });

  it('keeps only the logo mark when unpinned', async () => {
    await renderNav({ isPinned: false });

    const logo = screen.getByRole('link', { name: 'Agent Platform' });
    expect(logo).toHaveAttribute('href', '/');
    expect(logo).toHaveTextContent('');
  });

  it('highlights the item of the current location', async () => {
    await renderNav({ path: '/agent-platform/usage/cost' });

    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'New session' }),
    ).not.toHaveAttribute('aria-current');
  });

  it.each([
    '/agent-platform/agents/gazelle/kagent/sre',
    '/agent-platform/models/serving',
    '/agent-platform/mcp-servers',
    '/agent-platform/workflows/deploy',
    '/customize/connectors',
  ])('makes Customize the current item on %s', async path => {
    await renderNav({ path });

    expect(screen.getByRole('link', { name: 'Customize' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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

  it('heads the profile menu with the email alone when there is no name', async () => {
    await renderNav({
      profile: { displayName: '', email: 'jane@example.com' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Profile and settings' }),
    );

    const menu = await screen.findByRole('menu');
    const group = within(menu).getByRole('group', {
      name: 'jane@example.com',
    });
    expect(group.querySelector('header')?.children).toHaveLength(1);
  });

  it('opens the profile menu with the user name and email, settings link and sign out', async () => {
    await renderNav();

    const trigger = screen.getByRole('button', {
      name: 'Profile and settings',
    });
    expect(await within(trigger).findByText('Jane Doe')).toBeInTheDocument();

    await userEvent.click(trigger);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Jane Doe')).toBeInTheDocument();
    expect(within(menu).getByText('jane@example.com')).toBeInTheDocument();
    expect(
      within(menu).getByRole('group', { name: 'Jane Doe jane@example.com' }),
    ).toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(menuItem => menuItem.textContent),
    ).toEqual(['Profile and settings', 'Help and feedback', 'Sign out']);
    // The shell's own profile page, same tab — not the classic /settings.
    expect(
      within(menu).getByRole('menuitem', { name: 'Profile and settings' }),
    ).toHaveAttribute('href', '/agent-platform/profile');
    const help = within(menu).getByRole('menuitem', {
      name: 'Help and feedback',
    });
    // Another origin: opens a new tab, so the portal is not navigated away.
    expect(help).toHaveAttribute('href', 'https://docs.giantswarm.io');
    expect(help).toHaveAttribute('target', '_blank');

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Sign out' }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
