import React, { PropsWithChildren, useEffect } from 'react';
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
import { useTelemetryDeck } from '@typedigital/telemetrydeck-react';
import { useLocation } from 'react-router-dom';
import { getTelemetryPageViewPayload } from '../../utils/telemetry';
import { NotificationsSidebarItem } from '@backstage/plugin-notifications';

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
  const { signal } = useTelemetryDeck();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      try {
        await signal('pageview', getTelemetryPageViewPayload(location));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Error sending telemetry signal', error);
      }
    })();
  }, [location, signal]);

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
          <NotificationsSidebarItem />
          <SidebarSettings />
        </SidebarGroup>
      </Sidebar>
      {children}
    </SidebarPage>
  );
};
