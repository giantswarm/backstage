import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
  useSidebarPinState,
} from '@backstage/core-components';
import { compatWrapper } from '@backstage/core-compat-api';
import { useApiHolder } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { SidebarLogo } from './SidebarLogo';
import { NavItemIcon } from './NavItemIcon';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import FolderIcon from '@material-ui/icons/Folder';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { SidebarSearchModal } from '@backstage/plugin-search';
import {
  UserSettingsSignInAvatar,
  Settings as SidebarSettings,
} from '@backstage/plugin-user-settings';
import {
  AIChatIcon,
  aiChatDrawerApiRef,
  rootRouteRef as aiChatRouteRef,
} from '@giantswarm/backstage-plugin-ai-chat-react';
import {
  ClusterAccessConnector,
  ClusterAccessStatusSidebarItem,
} from '@giantswarm/backstage-plugin-gs';

function AiChatSidebarItem() {
  const apiHolder = useApiHolder();
  const drawerApi = apiHolder.get(aiChatDrawerApiRef);
  const aiChatLink = useRouteRef(aiChatRouteRef);

  const icon = () => (
    <NavItemIcon>
      <AIChatIcon />
    </NavItemIcon>
  );

  if (drawerApi) {
    return (
      <SidebarItem
        icon={icon}
        text="AI Assistant"
        onClick={() => drawerApi.toggleDrawer()}
      />
    );
  }

  if (aiChatLink) {
    return <SidebarItem icon={icon} to={aiChatLink()} text="AI Assistant" />;
  }

  return null;
}

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
 * (`app.routes.bindings`) -- the scaffolder's templates by default, the
 * Repositories page's declaration form where a deployment binds
 * `repositories.create`. Shown only when something is bound.
 */
function CreateSidebarItem({ fallback }: { fallback?: string }) {
  const createLink = useRouteRef(catalogPlugin.externalRoutes.createComponent);
  const to = createLink?.() ?? fallback;
  if (!to) {
    return null;
  }
  return <SidebarItem icon={CreateComponentIcon} to={to} text="Create..." />;
}

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
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

      const group1 = [
        nav.take('page:home'),
        catalogItem && (
          <SidebarItem
            key="catalog"
            icon={FolderIcon}
            to="catalog"
            text="Catalog"
          />
        ),
        nav.take('page:techdocs'),
      ].filter(Boolean);

      const group2 = [
        nav.take('page:gs/deployments'),
        nav.take('page:gs/clusters'),
        nav.take('page:gs/installations'),
        nav.take('page:flux'),
        nav.take('page:agent-platform'),
        nav.take('page:plans'),
        nav.take('page:roadmap'),
        nav.take('page:repositories'),
        nav.take('page:bot-prs'),
      ].filter(Boolean);

      const group3 = [
        <AiChatSidebarItem key="ai-chat" />,
        <CreateSidebarItem
          key="create"
          fallback={scaffolderItem ? 'create' : undefined}
        />,
      ];

      const menuGroups = [group1, group2, group3].filter(g => g.length > 0);

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
    },
  },
});
