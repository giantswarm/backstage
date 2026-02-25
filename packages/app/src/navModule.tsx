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
import { ReactNode } from 'react';
import FolderIcon from '@material-ui/icons/Folder';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import LogoFull from './components/Root/LogoFull';
import LogoIcon from './components/Root/LogoIcon';

const useStyles = makeStyles({
  navItemIcon: {
    display: 'inline-flex',
    '& > svg': {
      fontSize: '1.25rem',
    },
  },

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

const NavItemIcon = ({ children }: { children: ReactNode }) => {
  const classes = useStyles();
  return <span className={classes.navItemIcon}>{children}</span>;
};

const SidebarLogo = () => {
  const classes = useStyles();
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
              icon={() => <NavItemIcon>{item.icon}</NavItemIcon>}
              to={item.href}
              text={item.title}
            />
          ));

          // Consume items rendered as hardcoded SidebarItems below
          nav.take('page:search');
          nav.take('page:catalog');

          return (
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
                {nav.take('page:ai-chat')}
                <SidebarDivider />
                {nav.take('page:scaffolder')}
              </SidebarGroup>
              <SidebarSpace />
              <SidebarGroup
                label="Settings"
                icon={<UserSettingsSignInAvatar />}
                to="/settings"
              >
                {nav.take('page:user-settings')}
              </SidebarGroup>
            </Sidebar>
          );
        },
      },
    }),
  ],
});
