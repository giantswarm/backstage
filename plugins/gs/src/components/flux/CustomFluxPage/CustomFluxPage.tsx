import { DefaultFluxPage } from '@giantswarm/backstage-plugin-flux-react';
import { CustomTreeViewFilters } from './CustomTreeViewFilters';
import { CustomListViewFilters } from './CustomListViewFilters';

export const CustomFluxPage = () => {
  return (
    <DefaultFluxPage
      treeViewFilters={<CustomTreeViewFilters />}
      listViewFilters={<CustomListViewFilters />}
    />
  );
};
