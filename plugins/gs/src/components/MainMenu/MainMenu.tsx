import React from 'react';
import { SidebarGroup, SidebarItem } from '@backstage/core-components';
import { FeatureFlagged } from '@backstage/core-app-api';
import { FeatureEnabled } from '../FeatureEnabled';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import PlaceIcon from '@material-ui/icons/Place';

export const MainMenu = () => {
  return (
    <SidebarGroup>
      <FeatureEnabled feature="installationsPage">
        <FeatureFlagged with="show-installations-page">
          <SidebarItem
            icon={PlaceIcon}
            to="installations"
            text="Installations"
          />
        </FeatureFlagged>
      </FeatureEnabled>

      <FeatureEnabled feature="clustersPage">
        <SidebarItem icon={GiantSwarmIcon} to="clusters" text="Clusters" />
      </FeatureEnabled>
    </SidebarGroup>
  );
};
