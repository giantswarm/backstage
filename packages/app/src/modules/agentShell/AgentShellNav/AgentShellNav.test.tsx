import type { ReactNode } from 'react';
import { SidebarPinStateProvider } from '@backstage/core-components';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import {
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';
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
        skills: createRouteRef(),
        models: createRouteRef(),
      },
    },
    RecentSessions: ({ shellRail }: { shellRail?: boolean }) => (
      <div data-testid="recent-sessions" data-shell-rail={String(shellRail)} />
    ),
    NeedsInputToasts: () => <div data-testid="needs-input-toasts" />,
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

/** The deployment's `app.portals`; both portals unless a test says otherwise. */
type PortalsConfig = { platformPortal?: boolean; agentPlatform?: boolean };

async function renderNav({
  bound = true,
  isPinned = true,
  isMobile = false,
  path = '/',
  profile = { displayName: 'Jane Doe', email: 'jane@example.com' },
  portals = { platformPortal: true, agentPlatform: true },
}: {
  profile?: { displayName?: string; email?: string };
  bound?: boolean;
  isPinned?: boolean;
  isMobile?: boolean;
  path?: string;
  portals?: PortalsConfig;
} = {}) {
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned, toggleSidebarPinState: () => {}, isMobile }}
    >
      <AgentShellNav />
    </SidebarPinStateProvider>,
    {
      initialRouteEntries: [path],
      config: {
        app: { baseUrl: 'http://localhost:3000', portals },
        backend: { baseUrl: 'http://localhost:7007' },
      },
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
          '/agent-platform/skills': agentPlatformPlugin.routes.skills,
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

    expect(railLinks()).toEqual([
      ['New session', '/'],
      ['Sessions', '/agent-platform/sessions'],
      ['Customize', '/customize'],
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

  // T22 D1: five labelled items, with Usage and the Platform Portal moved into
  // the Profile menu.
  describe('the phone bottom bar', () => {
    let layout: MockedLayout;

    beforeEach(() => {
      layout = mockPhoneLayout();
    });

    afterEach(() => {
      layout.restore();
    });

    function barItems() {
      const nav = screen.getByRole('navigation', { name: 'Main' });
      return within(nav).getAllByRole('listitem');
    }

    it('holds New session, Sessions, Search, Customize and Profile, in that order, each labelled', async () => {
      await renderNav({ isMobile: true });

      // The visible label under each icon: a phone shows no `title`.
      const labels = [
        'New session',
        'Sessions',
        'Search',
        'Customize',
        'Profile',
      ];
      const items = barItems();
      expect(items).toHaveLength(labels.length);
      items.forEach((item, index) => {
        expect(within(item).getByText(labels[index])).toBeInTheDocument();
      });
      const nav = screen.getByRole('navigation', { name: 'Main' });
      for (const name of ['New session', 'Sessions', 'Customize']) {
        const link = within(nav).getByRole('link', { name });
        expect(link).not.toHaveAttribute('title');
        expect(link).not.toHaveAttribute('aria-label');
      }
      expect(
        within(nav).getByRole('button', { name: 'Profile and settings' }),
      ).toHaveTextContent('Profile');
    });

    it('promises no keyboard shortcut on Search', async () => {
      await renderNav({ isMobile: true });

      const nav = screen.getByRole('navigation', { name: 'Main' });
      const search = within(nav).getByRole('button', { name: 'Search' });
      expect(search).not.toHaveAttribute('title');
      expect(search).not.toHaveAttribute('aria-keyshortcuts');
      expect(nav).not.toHaveTextContent(/⌘K|Ctrl\+K/);
    });

    it('leaves Usage and the Platform Portal out of the bar', async () => {
      await renderNav({ isMobile: true });

      const nav = screen.getByRole('navigation', { name: 'Main' });
      expect(within(nav).queryByRole('link', { name: 'Usage' })).toBeNull();
      expect(
        within(nav).queryByRole('link', { name: 'Platform Portal' }),
      ).toBeNull();
    });

    it('moves Usage and the Platform Portal into the Profile menu', async () => {
      await renderNav({ isMobile: true });

      await userEvent.click(
        screen.getByRole('button', { name: 'Profile and settings' }),
      );
      const menu = await screen.findByRole('menu');
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map(menuItem => menuItem.textContent),
      ).toEqual([
        'Profile and settings',
        'Usage',
        'Platform Portal',
        'Help and feedback',
        'Sign out',
      ]);
      // Usage stays in the shell; the cross-link leaves it in a new tab.
      const usage = within(menu).getByRole('menuitem', { name: 'Usage' });
      expect(usage).toHaveAttribute('href', '/agent-platform/usage');
      expect(usage).not.toHaveAttribute('target');
      const portal = within(menu).getByRole('menuitem', {
        name: 'Platform Portal',
      });
      expect(portal).toHaveAttribute('href', '/clusters');
      expect(portal).toHaveAttribute('target', '_blank');
    });

    it('leaves the Platform Portal out of the Profile menu on an agent-only deployment', async () => {
      await renderNav({
        isMobile: true,
        portals: { platformPortal: false, agentPlatform: true },
      });

      await userEvent.click(
        screen.getByRole('button', { name: 'Profile and settings' }),
      );
      const menu = await screen.findByRole('menu');
      expect(
        within(menu).queryByRole('menuitem', { name: 'Platform Portal' }),
      ).toBeNull();
      expect(
        within(menu).getByRole('menuitem', { name: 'Usage' }),
      ).toBeInTheDocument();
    });

    it('leaves Usage out of the Profile menu while its route is not bound', async () => {
      await renderNav({ isMobile: true, bound: false });

      await userEvent.click(
        screen.getByRole('button', { name: 'Profile and settings' }),
      );
      const menu = await screen.findByRole('menu');
      expect(
        within(menu).queryByRole('menuitem', { name: 'Usage' }),
      ).toBeNull();
    });

    it.each(['/agent-platform/usage/cost', '/agent-platform/profile'])(
      'marks Profile current on %s, a page only its menu leads to',
      async path => {
        await renderNav({ isMobile: true, path });

        expect(
          screen.getByRole('button', { name: 'Profile and settings' }),
        ).toHaveAttribute('data-current', 'true');
      },
    );

    it('marks the current item, and only it', async () => {
      await renderNav({ isMobile: true, path: '/customize/connectors' });

      const nav = screen.getByRole('navigation', { name: 'Main' });
      expect(
        within(nav).getByRole('link', { name: 'Customize' }),
      ).toHaveAttribute('aria-current', 'page');
      expect(
        within(nav).getByRole('link', { name: 'New session' }),
      ).not.toHaveAttribute('aria-current');
      expect(
        screen.getByRole('button', { name: 'Profile and settings' }),
      ).not.toHaveAttribute('data-current');
    });

    // agent-shell.css hides the bar by this class while the soft keyboard is
    // up (T22 C2).
    it('carries the stable class the stylesheet hides it by', async () => {
      await renderNav({ isMobile: true });

      expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass(
        'agent-shell-mobile-bar',
      );
    });

    it('is not the desktop rail', async () => {
      await renderNav();

      expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveClass(
        'agent-shell-mobile-bar',
      );
    });
  });

  describe('the needs-input toast watcher', () => {
    it.each([
      ['an expanded rail', { isPinned: true }],
      ['a collapsed rail', { isPinned: false }],
      ['the mobile bar', { isMobile: true }],
    ])('is mounted exactly once with %s', async (_, options) => {
      await renderNav(options);

      // Once, and outside the rail's session list, which only the expanded
      // rail renders: every layout gets the toast, none gets it twice.
      expect(screen.getAllByTestId('needs-input-toasts')).toHaveLength(1);
      const recent = screen.queryByTestId('recent-sessions');
      expect(
        recent?.contains(screen.getByTestId('needs-input-toasts')) ?? false,
      ).toBe(false);
    });
  });

  it('mounts the cluster-access connector that the installation inventory waits on', async () => {
    await renderNav();
    expect(screen.getByTestId('cluster-access-connector')).toBeInTheDocument();
  });

  it('has no notification bell: the session dots are the signal', async () => {
    await renderNav();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Notifications')).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole('button', { name: /notification/i }),
    ).not.toBeInTheDocument();
  });

  it('has no notification bell in the mobile bar either', async () => {
    await renderNav({ isMobile: true });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav).queryByRole('button', { name: /notification/i }),
    ).not.toBeInTheDocument();
    expect(
      within(nav)
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Search', 'Profile and settings']);
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

  it('leaves the Platform Portal cross-link out on an agent-only deployment', async () => {
    await renderNav({
      portals: { platformPortal: false, agentPlatform: true },
    });

    expect(railLinks()).toEqual([
      ['Agent Platform', '/'],
      ['New session', '/'],
      ['Customize', '/customize'],
      ['Usage', '/agent-platform/usage'],
    ]);
    expect(
      screen.queryByRole('link', { name: 'Platform Portal' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the Platform Portal cross-link out of the mobile bar on an agent-only deployment', async () => {
    await renderNav({
      isMobile: true,
      portals: { platformPortal: false, agentPlatform: true },
    });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav).queryByRole('link', { name: 'Platform Portal' }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: 'New session' }),
    ).toHaveAttribute('href', '/');
  });

  it('keeps the Platform Portal cross-link when the deployment sets no portals', async () => {
    // A person who opted in by flag on a classic-only deployment still has
    // the classic portal to go back to.
    await renderNav({ portals: {} });

    expect(
      screen.getByRole('link', { name: 'Platform Portal' }),
    ).toHaveAttribute('target', '_blank');
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
    '/agent-platform/skills/giantswarm/agent-skills/triage',
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

  // Live round L1: inside the bottom-anchored mobile bar the hidden skip link
  // floated over the content and took the clicks meant for the wizard's
  // Cancel.
  it('keeps the skip link out of the mobile bar and out of the way of clicks until focused', async () => {
    const user = userEvent.setup();
    await renderNav({ isMobile: true });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(nav).not.toContainElement(skip);

    const hidden = window.getComputedStyle(skip);
    expect(hidden.position).toBe('fixed');
    expect(hidden.pointerEvents).toBe('none');
    expect(hidden.width).toBe('1px');
    expect(hidden.overflow).toBe('hidden');

    await user.tab();

    expect(skip).toHaveFocus();
    const focused = window.getComputedStyle(skip);
    expect(focused.pointerEvents).toBe('auto');
    expect(focused.width).toBe('auto');
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
