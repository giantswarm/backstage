import { SidebarPinStateProvider } from '@backstage/core-components';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import {
  createExtensionTester,
  mockApis,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import {
  NavContentBlueprint,
  NavContentNavItems,
} from '@backstage/plugin-app-react';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { aiChatDrawerApiRef } from '@giantswarm/backstage-plugin-ai-chat-react';
import { fireEvent, screen } from '@testing-library/react';
import { homeRouteRef } from '../agentShell/routes';
import { SidebarContent } from './Sidebar';

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    AGENT_SHELL_FLAG: 'agent-platform-shell',
    agentPlatformPlugin: {
      routes: {
        sessions: createRouteRef(),
        usage: createRouteRef(),
        agents: createRouteRef(),
        skills: createRouteRef(),
        models: createRouteRef(),
        profile: createRouteRef(),
      },
    },
    RecentSessions: () => <div data-testid="recent-sessions" />,
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
  ClusterAccessStatusSidebarItem: () => (
    <div data-testid="cluster-access-item" />
  ),
}));

jest.mock('@backstage/plugin-user-settings', () => ({
  UserSettingsSignInAvatar: () => null,
  Settings: () => null,
}));

const navItems = {
  take: () => undefined,
  rest: () => [],
  clone: () => navItems,
  withComponent: () => ({ take: () => null, rest: () => [] }),
} as unknown as NavContentNavItems;

/**
 * Nav items with the Agent Platform page's own item offered, the way the app
 * hands it over wherever `page:agent-platform` is mounted; drawn, it would
 * read "Classic Agent Platform".
 */
const withAgentPlatformItem = {
  ...navItems,
  withComponent: () => ({
    take: (id: string) =>
      id === 'page:agent-platform' ? (
        <a key="classic-agent-platform" href="/agent-platform">
          Classic Agent Platform
        </a>
      ) : null,
    rest: () => [],
  }),
} as unknown as NavContentNavItems;

async function renderSidebar({
  isMobile = false,
  flag = FeatureFlagState.None,
  path = '/clusters',
  portals,
  rootRedirect,
  navItems: items = navItems,
}: {
  isMobile?: boolean;
  flag?: FeatureFlagState;
  path?: string;
  /** The deployment's `app.portals`; unset is the classic-only default. */
  portals?: { platformPortal?: boolean; agentPlatform?: boolean };
  rootRedirect?: string;
  navItems?: NavContentNavItems;
} = {}) {
  const Content = createExtensionTester(SidebarContent).get(
    NavContentBlueprint.dataRefs.component,
  );
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned: true, toggleSidebarPinState: () => {}, isMobile }}
    >
      <Content navItems={items} items={[]} />
    </SidebarPinStateProvider>,
    {
      initialRouteEntries: [path],
      config: {
        app: { baseUrl: 'http://localhost:3000', portals, rootRedirect },
        backend: { baseUrl: 'http://localhost:7007' },
      },
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
      // The Agent Platform's address is the shell's home.
      mountedRoutes: { '/': homeRouteRef },
    },
  );
}

describe('SidebarContent', () => {
  it('keeps main’s classic labels: Catalog, AI Assistant and Create...', async () => {
    // The catalog and the scaffolder pages are installed; the ai-chat drawer
    // is mounted (app-config's `api:ai-chat/drawer`).
    const withPages = {
      ...navItems,
      take: (id: string) =>
        id === 'page:catalog' || id === 'page:scaffolder' ? {} : undefined,
    } as unknown as NavContentNavItems;
    const toggleDrawer = jest.fn();
    const Content = createExtensionTester(SidebarContent).get(
      NavContentBlueprint.dataRefs.component,
    );
    await renderInTestApp(
      <SidebarPinStateProvider
        value={{
          isPinned: true,
          toggleSidebarPinState: () => {},
          isMobile: false,
        }}
      >
        <Content navItems={withPages} items={[]} />
      </SidebarPinStateProvider>,
      {
        initialRouteEntries: ['/clusters'],
        config: {
          app: { baseUrl: 'http://localhost:3000' },
          backend: { baseUrl: 'http://localhost:7007' },
        },
        apis: [
          mockApis.featureFlags({
            initialStates: { [AGENT_SHELL_FLAG]: FeatureFlagState.None },
          }),
          [
            aiChatDrawerApiRef,
            {
              toggleDrawer,
              openDrawer: jest.fn(),
              closeDrawer: jest.fn(),
              registerHandler: () => () => {},
            },
          ],
        ],
      },
    );

    expect(screen.getByRole('link', { name: /^Catalog$/ })).toHaveAttribute(
      'href',
      '/catalog',
    );
    expect(screen.getByRole('link', { name: /^Create\.\.\.$/ })).toBeVisible();
    expect(screen.queryByText('Software')).not.toBeInTheDocument();
    expect(screen.queryByText('Templates')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /AI Assistant/ }));
    expect(toggleDrawer).toHaveBeenCalledTimes(1);
  });

  it('shows Cluster access in the desktop sidebar', async () => {
    await renderSidebar({ isMobile: false });

    expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-access-connector')).toBeInTheDocument();
  });

  it('shows Cluster access in the Menu of the mobile sidebar', async () => {
    await renderSidebar({ isMobile: true });

    // The connector is headless and must run without the item being opened.
    expect(screen.getByTestId('cluster-access-connector')).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-access-item')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
  });

  it('offers no Agent Platform cross-link while the flag is off', async () => {
    await renderSidebar({ flag: FeatureFlagState.None });

    expect(
      screen.queryByRole('link', { name: /Agent Platform/ }),
    ).not.toBeInTheDocument();
  });

  it('draws nothing of the Agent Platform while the flag is off, even with its page item offered', async () => {
    // As if `app.extensions` listed `page:agent-platform` (the base
    // app-config does): the classic portal still shows no trace of it.
    await renderSidebar({
      flag: FeatureFlagState.None,
      navItems: withAgentPlatformItem,
    });

    expect(screen.queryByText('Agent Platform')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Classic Agent Platform'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Agent Platform/ }),
    ).not.toBeInTheDocument();
  });

  it('carries only the cross-link while the flag is on, never the page’s own item', async () => {
    await renderSidebar({
      flag: FeatureFlagState.Active,
      navItems: withAgentPlatformItem,
    });

    expect(
      screen.queryByText('Classic Agent Platform'),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /Agent Platform/ }),
    ).toHaveLength(1);
  });

  it('cross-links to the agent shell in a new tab while the flag is on', async () => {
    await renderSidebar({ flag: FeatureFlagState.Active, path: '/clusters' });

    const link = screen.getByRole('link', { name: /Agent Platform/ });
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders the agent shell rail instead on agent-area routes while the flag is on', async () => {
    await renderSidebar({ flag: FeatureFlagState.Active, path: '/' });

    expect(
      screen.getByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-access-item')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Menu' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the classic sidebar on agent-area routes while the flag is off', async () => {
    await renderSidebar({ flag: FeatureFlagState.None, path: '/' });

    expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Main' }),
    ).not.toBeInTheDocument();
  });

  describe('per the deployment’s portals', () => {
    it('cross-links to the agent shell in a new tab when both portals are on, flag or not', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: true },
      });

      const link = screen.getByRole('link', { name: /Agent Platform/ });
      expect(link).toHaveAttribute('href', '/');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('renders the rail at / when both portals are on', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: true },
        path: '/',
      });

      expect(
        screen.getByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('cluster-access-item'),
      ).not.toBeInTheDocument();
    });

    it('renders the rail at / on an agent-only deployment', async () => {
      await renderSidebar({
        portals: { platformPortal: false, agentPlatform: true },
        path: '/',
      });

      expect(
        screen.getByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Platform Portal' }),
      ).not.toBeInTheDocument();
    });

    it('leads a classic page reached by URL on an agent-only deployment back home in the same tab', async () => {
      await renderSidebar({
        portals: { platformPortal: false, agentPlatform: true },
        path: '/clusters',
      });

      const link = screen.getByRole('link', { name: /Agent Platform/ });
      expect(link).toHaveAttribute('href', '/');
      expect(link).not.toHaveAttribute('target');
    });

    it('keeps the classic logo home in the same tab with the classic portal alone', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: false },
      });

      const logo = screen.getByRole('link', { name: 'Home' });
      expect(logo).toHaveAttribute('href', '/');
      expect(logo).not.toHaveAttribute('target');
    });

    it('opens the shell’s home in a new tab from the classic logo when both portals are on', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: true },
      });

      const logo = screen.getByRole('link', {
        name: 'Home (opens in a new tab)',
      });
      expect(logo).toHaveAttribute('href', '/');
      expect(logo).toHaveAttribute('target', '_blank');
    });

    it('leads the classic logo to a classic app.rootRedirect when both portals are on', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: true },
        rootRedirect: '/catalog',
      });

      const logo = screen.getByRole('link', { name: 'Home' });
      expect(logo).toHaveAttribute('href', '/catalog');
      expect(logo).not.toHaveAttribute('target');
    });

    it('ignores an app.rootRedirect into the agent area for the classic logo', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: true },
        rootRedirect: '/agent-platform',
      });

      expect(
        screen.getByRole('link', { name: 'Home (opens in a new tab)' }),
      ).toHaveAttribute('href', '/');
    });

    it('keeps the classic logo in the same tab on an agent-only deployment', async () => {
      await renderSidebar({
        portals: { platformPortal: false, agentPlatform: true },
      });

      expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
        'target',
      );
    });

    it('is the classic portal with no cross-link on a platform-only deployment', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: false },
        path: '/',
      });

      expect(screen.getByTestId('cluster-access-item')).toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Main' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /Agent Platform/ }),
      ).not.toBeInTheDocument();
    });

    it('lets the flag opt one browser in on a platform-only deployment', async () => {
      await renderSidebar({
        portals: { platformPortal: true, agentPlatform: false },
        flag: FeatureFlagState.Active,
      });

      expect(
        screen.getByRole('link', { name: /Agent Platform/ }),
      ).toHaveAttribute('target', '_blank');
    });
  });
});
