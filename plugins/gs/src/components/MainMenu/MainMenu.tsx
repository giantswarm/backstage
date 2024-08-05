import React from 'react';
import { SidebarGroup, SidebarItem } from '@backstage/core-components';
import { FeatureFlagged } from '@backstage/core-app-api';
import { FeatureEnabled } from '../FeatureEnabled';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';

export const MainMenu = () => {
  return (
    <SidebarGroup>
      <FeatureEnabled feature="installationsPage">
        <FeatureFlagged with="show-installations-page">
          <SidebarItem
            icon={GiantSwarmIcon}
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
