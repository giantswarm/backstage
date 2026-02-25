/**
 * NFS nav module that provides the sidebar layout via NavContentBlueprint.
 *
 * Replaces the legacy Root component with a fully NFS-native sidebar.
 * Uses navItems.take() for plugin-registered nav items and hardcoded
 * SidebarItem for items with custom text/icons.
 */
import {
  Link,
  Sidebar,
  sidebarConfig,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarSpace,
  useSidebarOpenState,
} from '@backstage/core-components';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { makeStyles } from '@material-ui/core';
import HomeIcon from '@material-ui/icons/Home';
import FolderIcon from '@material-ui/icons/Folder';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import SettingsIcon from '@material-ui/icons/Settings';
import LogoFull from './components/Root/LogoFull';
import LogoIcon from './components/Root/LogoIcon';
import { GSFeatureEnabled } from '@giantswarm/backstage-plugin-gs';

const useSidebarLogoStyles = makeStyles({
  root: {
    width: sidebarConfig.drawerWidthClosed,
    height: 3 * sidebarConfig.logoHeight,
    display: 'flex',
    flexFlow: 'row nowrap',
    alignItems: 'center',
    marginBottom: -14,
  },
  link: {
    width: sidebarConfig.drawerWidthClosed,
    marginLeft: 24,
  },
});

const SidebarLogo = () => {
  const classes = useSidebarLogoStyles();
  const { isOpen } = useSidebarOpenState();

  return (
    <div className={classes.root}>
      <Link to="/" underline="none" className={classes.link} aria-label="Home">
        {isOpen ? <LogoFull /> : <LogoIcon />}
      </Link>
    </div>
  );
};

export const navModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    NavContentBlueprint.make({
      params: {
        component: ({ navItems }) => {
          const nav = navItems.withComponent(item => (
            <SidebarItem
              icon={() => item.icon}
              to={item.href}
              text={item.title}
            />
          ));

          // Consume items that are handled manually or not needed in sidebar
          nav.take('page:home');
          nav.take('page:search');
          nav.take('page:user-settings');
          nav.take('page:catalog');
          nav.take('page:techdocs');
          nav.take('page:scaffolder');

          return (
            <Sidebar>
              <SidebarLogo />
              <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
                <SidebarSearchModal />
              </SidebarGroup>
              <SidebarDivider />
              <SidebarGroup label="Menu" icon={<MenuIcon />}>
                <SidebarItem icon={HomeIcon} to="/" text="Home" />
                <SidebarItem icon={FolderIcon} to="catalog" text="Catalog" />
                <SidebarItem icon={LibraryBooks} to="docs" text="Docs" />
              </SidebarGroup>
              <SidebarDivider />
              <SidebarGroup>
                <GSFeatureEnabled feature="deploymentsPage">
                  {nav.take('page:gs/deployments')}
                </GSFeatureEnabled>
                <GSFeatureEnabled feature="clustersPage">
                  {nav.take('page:gs/clusters')}
                </GSFeatureEnabled>
                <GSFeatureEnabled feature="installationsPage">
                  {nav.take('page:gs/installations')}
                </GSFeatureEnabled>
                <GSFeatureEnabled feature="fluxPage">
                  {nav.take('page:flux')}
                </GSFeatureEnabled>
              </SidebarGroup>
              <SidebarGroup label="Menu" icon={<MenuIcon />}>
                <GSFeatureEnabled feature="aiChat">
                  {nav.take('page:ai-chat')}
                </GSFeatureEnabled>
                <GSFeatureEnabled feature="scaffolder">
                  <SidebarDivider />
                  <SidebarItem
                    icon={CreateComponentIcon}
                    to="create"
                    text="Create..."
                  />
                </GSFeatureEnabled>
              </SidebarGroup>
              <SidebarSpace />
              <SidebarGroup
                label="Settings"
                icon={<UserSettingsSignInAvatar />}
                to="/settings"
              >
                <SidebarItem
                  icon={SettingsIcon}
                  to="/settings"
                  text="Settings"
                />
              </SidebarGroup>
            </Sidebar>
          );
        },
      },
    }),
  ],
});
