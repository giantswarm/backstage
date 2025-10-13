import { FluxResourcesTreeViewResourceTypePicker } from '@giantswarm/backstage-plugin-flux-react';
import { ClusterPicker } from './treeViewFilters';

export const CustomTreeViewFilters = () => {
  return (
    <>
      <ClusterPicker />
      <FluxResourcesTreeViewResourceTypePicker />
    </>
  );
};
