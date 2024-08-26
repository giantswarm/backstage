import React from 'react';
import { SidebarGroup, SidebarItem } from '@backstage/core-components';
import { FeatureEnabled } from '../FeatureEnabled';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import PlaceIcon from '@material-ui/icons/Place';

export const MainMenu = () => {
  return (
    <SidebarGroup>
      <FeatureEnabled feature="installationsPage">
        <SidebarItem icon={PlaceIcon} to="installations" text="Installations" />
      </FeatureEnabled>

      <FeatureEnabled feature="clustersPage">
        <SidebarItem icon={GiantSwarmIcon} to="clusters" text="Clusters" />
      </FeatureEnabled>
    </SidebarGroup>
  );
};
