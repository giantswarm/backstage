import { PropsWithChildren } from 'react';
import { makeStyles } from '@material-ui/core';
import FolderIcon from '@material-ui/icons/Folder';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import HomeIcon from '@material-ui/icons/Home';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import LogoFull from './LogoFull';
import LogoIcon from './LogoIcon';
import {
  Settings as SidebarSettings,
  UserSettingsSignInAvatar,
} from '@backstage/plugin-user-settings';
import { SidebarSearchModal } from '@backstage/plugin-search';
import {
  Sidebar,
  sidebarConfig,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarPage,
  SidebarSpace,
  useSidebarOpenState,
  Link,
} from '@backstage/core-components';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { GSFeatureEnabled, GSMainMenu } from '@giantswarm/backstage-plugin-gs';
import { AIChatIcon } from '@giantswarm/backstage-plugin-ai-chat';

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

export const Root = ({ children }: PropsWithChildren<{}>) => {
  return (
    <SidebarPage>
      <Sidebar>
        <SidebarLogo />
        <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
          <SidebarSearchModal />
        </SidebarGroup>
        <SidebarDivider />
        <SidebarGroup label="Menu" icon={<MenuIcon />}>
          {/* Global nav, not org-specific */}
          <SidebarItem icon={HomeIcon} to="/" text="Home" />
          <SidebarItem icon={FolderIcon} to="catalog" text="Catalog" />
          <SidebarItem icon={LibraryBooks} to="docs" text="Docs" />
          {/* End global nav */}
        </SidebarGroup>
        <SidebarDivider />
        <GSMainMenu />
        <SidebarGroup label="Menu" icon={<MenuIcon />}>
          <GSFeatureEnabled feature="aiChat">
            <SidebarItem icon={AIChatIcon} to="ai-chat" text="AI Assistant" />
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
          <SidebarSettings />
        </SidebarGroup>
      </Sidebar>
      {children}
    </SidebarPage>
  );
};
