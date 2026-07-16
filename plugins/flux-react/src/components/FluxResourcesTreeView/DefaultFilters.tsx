import { ClusterPicker } from './filters/ClusterPicker';
import { ResourceTypePicker } from './filters/ResourceTypePicker';
import { StatusPicker } from './filters/StatusPicker';
import { TreeSearch } from './filters/TreeSearch';

export const DefaultFilters = () => {
  return (
    <>
      <ClusterPicker />
      <ResourceTypePicker />
      <StatusPicker />
      <TreeSearch />
    </>
  );
};
