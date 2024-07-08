import React, { PropsWithChildren } from 'react';
import { makeStyles } from '@material-ui/core';
import CreateComponentIcon from '@material-ui/icons/AddCircleOutline';
import HomeIcon from '@material-ui/icons/Home';
import LibraryBooks from '@material-ui/icons/LibraryBooks';
import LogoFull from './LogoFull';
import LogoIcon from './LogoIcon';
import { FeatureFlagged } from '@backstage/core-app-api';
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
import ReportProblemIcon from '@material-ui/icons/ReportProblem';
import { FluxIcon } from '@weaveworksoss/backstage-plugin-flux';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import { ConfigurationAvailable } from '../ConfigurationAvailable/ConfigurationAvailable';

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

export const Root = ({ children }: PropsWithChildren<{}>) => (
  <SidebarPage>
    <Sidebar>
      <SidebarLogo />
      <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
        <SidebarSearchModal />
      </SidebarGroup>
      <SidebarDivider />
      <SidebarGroup label="Menu" icon={<MenuIcon />}>
        {/* Global nav, not org-specific */}
        <SidebarItem icon={HomeIcon} to="catalog" text="Home" />
        <ConfigurationAvailable configKey="gs">
          <SidebarItem icon={GiantSwarmIcon} to="clusters" text="Clusters" />
        </ConfigurationAvailable>
        <SidebarItem icon={LibraryBooks} to="docs" text="Docs" />
        <ConfigurationAvailable configKey="opsgenie.domain">
          <SidebarItem icon={ReportProblemIcon} to="opsgenie" text="OpsGenie" />
        </ConfigurationAvailable>
        <FeatureFlagged with="show-flux-runtime">
          <SidebarItem icon={FluxIcon} to="flux-runtime" text="Flux Runtime" />
        </FeatureFlagged>
        <FeatureFlagged with="show-software-templates">
          <SidebarItem icon={CreateComponentIcon} to="create" text="Create..." /> 
        </FeatureFlagged>

        {/* End global nav */}
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
    </Sidebar>
    {children}
  </SidebarPage>
);
