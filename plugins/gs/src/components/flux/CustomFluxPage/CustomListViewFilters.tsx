import {
  FluxResourcesListViewKindPicker,
  FluxResourcesListViewStatusPicker,
} from '@giantswarm/backstage-plugin-flux-react';
import { ClusterPicker } from './listViewFilters';

export const CustomListViewFilters = () => {
  return (
    <>
      <ClusterPicker />
      <FluxResourcesListViewKindPicker />
      <FluxResourcesListViewStatusPicker />
    </>
  );
};
