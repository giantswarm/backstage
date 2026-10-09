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
import { fireEvent, screen } from '@testing-library/react';
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
        models: createRouteRef(),
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

async function renderSidebar({
  isMobile = false,
  flag = FeatureFlagState.None,
  path = '/clusters',
}: {
  isMobile?: boolean;
  flag?: FeatureFlagState;
  path?: string;
} = {}) {
  const Content = createExtensionTester(SidebarContent).get(
    NavContentBlueprint.dataRefs.component,
  );
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned: true, toggleSidebarPinState: () => {}, isMobile }}
    >
      <Content navItems={navItems} items={[]} />
    </SidebarPinStateProvider>,
    {
      initialRouteEntries: [path],
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
    },
  );
}

describe('SidebarContent', () => {
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
});
