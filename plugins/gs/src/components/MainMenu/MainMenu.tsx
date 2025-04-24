import { SidebarGroup, SidebarItem } from '@backstage/core-components';
import { FeatureEnabled } from '../FeatureEnabled';
import ApartmentIcon from '@material-ui/icons/Apartment';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import StorageIcon from '@material-ui/icons/Storage';

export const MainMenu = () => {
  return (
    <SidebarGroup>
      <FeatureEnabled feature="deploymentsPage">
        <SidebarItem
          icon={CloudUploadIcon}
          to="deployments"
          text="Deployments"
        />
      </FeatureEnabled>

      <FeatureEnabled feature="clustersPage">
        <SidebarItem icon={StorageIcon} to="clusters" text="Clusters" />
      </FeatureEnabled>

      <FeatureEnabled feature="installationsPage">
        <SidebarItem
          icon={ApartmentIcon}
          to="installations"
          text="Installations"
        />
      </FeatureEnabled>
    </SidebarGroup>
  );
};
