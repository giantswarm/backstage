import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
} from '@backstage/core-components';
import { compatWrapper } from '@backstage/core-compat-api';
import { useApiHolder } from '@backstage/core-plugin-api';
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
} from '@giantswarm/backstage-plugin-ai-chat-react';

function AiChatSidebarItem() {
  const apiHolder = useApiHolder();
  const drawerApi = apiHolder.get(aiChatDrawerApiRef);

  if (!drawerApi) return null;

  return (
    <SidebarItem
      icon={() => (
        <NavItemIcon>
          <AIChatIcon />
        </NavItemIcon>
      )}
      text="AI Assistant"
      onClick={() => drawerApi.toggleDrawer()}
    />
  );
}

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
      const nav = navItems.withComponent(item => (
        <SidebarItem
          icon={() => <NavItemIcon>{item.icon}</NavItemIcon>}
          to={item.href}
          text={item.title}
        />
      ));

      return compatWrapper(
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarDivider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            {nav.take('page:home')}
            <SidebarItem icon={FolderIcon} to="catalog" text="Catalog" />
            {nav.take('page:techdocs')}
            <SidebarDivider />
            {nav.take('page:gs/deployments')}
            {nav.take('page:gs/clusters')}
            {nav.take('page:gs/installations')}
            {nav.take('page:flux')}
            <SidebarDivider />
            <AiChatSidebarItem />
            <SidebarItem
              icon={CreateComponentIcon}
              to="create"
              text="Create..."
            />
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
