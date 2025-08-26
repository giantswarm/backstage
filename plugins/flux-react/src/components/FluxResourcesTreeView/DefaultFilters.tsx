import { ClusterPicker } from './filters/ClusterPicker';
import { ResourceTypePicker } from './filters/ResourceTypePicker';

export const DefaultFilters = () => {
  return (
    <>
      <ClusterPicker />
      <ResourceTypePicker />
    </>
  );
};
