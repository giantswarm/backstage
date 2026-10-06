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

async function renderSidebar({ isMobile }: { isMobile: boolean }) {
  const Content = createExtensionTester(SidebarContent).get(
    NavContentBlueprint.dataRefs.component,
  );
  await renderInTestApp(
    <SidebarPinStateProvider
      value={{ isPinned: true, toggleSidebarPinState: () => {}, isMobile }}
    >
      <Content navItems={navItems} items={[]} />
    </SidebarPinStateProvider>,
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
});
