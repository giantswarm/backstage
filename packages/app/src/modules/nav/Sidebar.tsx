import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
  useSidebarPinState,
} from '@backstage/core-components';
import { compatWrapper } from '@backstage/core-compat-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  NavContentBlueprint,
  NavContentComponentProps,
} from '@backstage/plugin-app-react';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { useLocation } from 'react-router-dom';
import { SidebarLogo } from './SidebarLogo';
import { NavItemIcon } from './NavItemIcon';
import { AgentShellNav } from '../agentShell/AgentShellNav';
import { isAgentArea, useAgentShellAvailable } from '../agentShell/agentArea';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import AndroidIcon from '@material-ui/icons/Android';
import FolderIcon from '@material-ui/icons/Folder';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { SidebarSearchModal } from '@backstage/plugin-search';
import {
  UserSettingsSignInAvatar,
  Settings as SidebarSettings,
} from '@backstage/plugin-user-settings';
import {
  ClusterAccessConnector,
  ClusterAccessStatusSidebarItem,
} from '@giantswarm/backstage-plugin-gs';

/**
 * The mobile sidebar is a bottom bar that renders only `SidebarGroup`s, so an
 * item outside a group is not shown there at all. On mobile the Cluster access
 * item goes into the Menu group; elsewhere it sits above Settings.
 */
function ClusterAccessSidebarItem({ mobile }: { mobile: boolean }) {
  const { isMobile = false } = useSidebarPinState();
  return isMobile === mobile ? <ClusterAccessStatusSidebarItem /> : null;
}

/**
 * *Create…*: where the catalog's `createComponent` external route points
 * (`app.routes.bindings`), else the scaffolder page when it is enabled.
 * Hidden when there is neither.
 */
function CreateSidebarItem({ fallback }: { fallback?: string }) {
  const createLink = useRouteRef(catalogPlugin.externalRoutes.createComponent);
  const to = createLink?.() ?? fallback;
  if (!to) {
    return null;
  }
  return <SidebarItem icon={CreateComponentIcon} to={to} text="Templates" />;
}

function ClassicSidebar({
  navItems,
  agentShellAvailable,
}: {
  navItems: NavContentComponentProps['navItems'];
  agentShellAvailable: boolean;
}) {
  const searchItem = navItems.take('page:search');
  const catalogItem = navItems.take('page:catalog');
  const scaffolderItem = navItems.take('page:scaffolder');
  const nav = navItems.withComponent(item => (
    <SidebarItem
      icon={() => <NavItemIcon>{item.icon}</NavItemIcon>}
      to={item.href}
      text={item.title}
    />
  ));

  // With the shell available, the agent platform lives in its own shell: the
  // in-place entry becomes a cross-link to the shell's home, in a new tab so
  // the classic portal stays where it is.
  const agentPlatformItem = nav.take('page:agent-platform');
  const agentPlatformEntry = agentShellAvailable ? (
    <SidebarItem
      key="agent-platform"
      icon={AndroidIcon}
      to="/"
      target="_blank"
      text="Agent Platform"
    />
  ) : (
    agentPlatformItem
  );

  const group1 = [
    nav.take('page:home'),
    catalogItem && (
      <SidebarItem
        key="catalog"
        icon={FolderIcon}
        to="catalog"
        text="Software"
      />
    ),
    nav.take('page:techdocs'),
  ].filter(Boolean);

  const group2 = [
    nav.take('page:gs/deployments'),
    nav.take('page:gs/clusters'),
    nav.take('page:gs/installations'),
    nav.take('page:flux'),
    agentPlatformEntry,
    nav.take('page:repositories'),
    nav.take('page:bot-prs'),
  ].filter(Boolean);

  // Product: Hive, what the teams plan, build and learned, in one place.
  // The old Plans, Roadmap and Magazine pages are redirects into it and
  // carry no nav item of their own.
  const productGroup = [nav.take('page:plans')].filter(Boolean);

  const group3 = [
    <CreateSidebarItem
      key="create"
      fallback={scaffolderItem ? 'create' : undefined}
    />,
  ];

  const menuGroups = [group1, group2, productGroup, group3].filter(
    g => g.length > 0,
  );

  return compatWrapper(
    <>
      <ClusterAccessConnector />
      <Sidebar>
        <SidebarLogo />

        {searchItem && (
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
        )}
        <SidebarGroup label="Menu" icon={<MenuIcon />}>
          {menuGroups.flatMap((group, i) => [
            <SidebarDivider key={`divider-${i}`} />,
            ...group,
          ])}
          <ClusterAccessSidebarItem mobile />
        </SidebarGroup>
        <SidebarSpace />
        <SidebarDivider />
        <ClusterAccessSidebarItem mobile={false} />
        <SidebarDivider />
        <SidebarGroup
          label="Settings"
          icon={<UserSettingsSignInAvatar />}
          to="/settings"
        >
          <SidebarSettings />
        </SidebarGroup>
      </Sidebar>
    </>,
  );
}

/**
 * The app's one nav (`AppNav` takes its content as a singleton): the agent
 * shell's rail on the agent area's routes while the `agent-platform-shell`
 * flag is on, the classic sidebar everywhere else — and, with the flag off,
 * everywhere. Decided per location at render time, in step with the layout
 * extension's choice of content region.
 */
function AppNavContent({ navItems }: NavContentComponentProps) {
  const agentShellAvailable = useAgentShellAvailable();
  const { pathname } = useLocation();
  if (agentShellAvailable && isAgentArea(pathname)) {
    return <AgentShellNav />;
  }
  return (
    <ClassicSidebar
      navItems={navItems}
      agentShellAvailable={agentShellAvailable}
    />
  );
}

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: AppNavContent,
  },
});
