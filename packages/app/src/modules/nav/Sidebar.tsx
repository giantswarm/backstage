import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
} from '@backstage/core-components';
import { compatWrapper } from '@backstage/core-compat-api';
import { useApiHolder } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
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

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
      const searchItem = navItems.take('page:search');
      const catalogItem = navItems.take('page:catalog');
      const scaffolderItem = navItems.take('page:scaffolder');
      const aiChatItem = navItems.take('page:ai-chat');
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
      ].filter(Boolean);

      const group3 = [
        aiChatItem && <AiChatSidebarItem key="ai-chat" />,
        scaffolderItem && (
          <SidebarItem
            icon={CreateComponentIcon}
            to="create"
            text="Create..."
          />
        ),
      ].filter(Boolean);

      const menuGroups = [group1, group2, group3].filter(g => g.length > 0);

      return compatWrapper(
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
          </SidebarGroup>
          <SidebarSpace />
          <SidebarDivider />
          <SidebarGroup
            label="Settings"
            icon={<UserSettingsSignInAvatar />}
            to="/settings"
          >
            <SidebarSettings />
          </SidebarGroup>
        </Sidebar>,
      );
    },
  },
});
