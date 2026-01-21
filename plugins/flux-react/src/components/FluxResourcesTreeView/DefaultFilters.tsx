import { ClusterPicker } from './filters/ClusterPicker';
import { ResourceTypePicker } from './filters/ResourceTypePicker';
import { TreeSearch } from './filters/TreeSearch';

export const DefaultFilters = () => {
  return (
    <>
      <ClusterPicker />
      <ResourceTypePicker />
      <TreeSearch />
    </>
  );
};
