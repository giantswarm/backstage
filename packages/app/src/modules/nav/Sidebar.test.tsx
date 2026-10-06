import { SidebarPinStateProvider } from '@backstage/core-components';
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import {
  NavContentBlueprint,
  NavContentNavItems,
} from '@backstage/plugin-app-react';
import { fireEvent, screen } from '@testing-library/react';
import { SidebarContent } from './Sidebar';

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

// `config` replaces the test app's own, so it carries the base URLs too.
const BASE = {
  app: { baseUrl: 'http://localhost:3000' },
  backend: { baseUrl: 'http://localhost:7007' },
};
const MAIN_AUTH = { ...BASE, gs: { authProvider: 'oidc-gazelle' } };

async function renderSidebar({
  isMobile,
  config = MAIN_AUTH,
}: {
  isMobile: boolean;
  config?: Record<string, unknown>;
}) {
  const Content = createExtensionTester(SidebarContent).get(
    NavContentBlueprint.dataRefs.component,
  );
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned: true, toggleSidebarPinState: () => {}, isMobile }}
    >
      <Content navItems={navItems} items={[]} />
    </SidebarPinStateProvider>,
    { config: config as never },
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

  it('leaves Cluster access out without a main auth provider', async () => {
    // The guest sign-in of a local start: no clusters to reach, and the
    // cluster access parts would throw without the main auth API.
    await renderSidebar({ isMobile: false, config: BASE });

    expect(screen.queryByTestId('cluster-access-item')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cluster-access-connector'),
    ).not.toBeInTheDocument();
  });
});
