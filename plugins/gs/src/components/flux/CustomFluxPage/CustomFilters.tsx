// eslint-disable-next-line @backstage/no-mixed-plugin-imports
import { ResourceTypePicker } from '@giantswarm/backstage-plugin-flux';
import { ClusterPicker } from './filters';

export const CustomFilters = () => {
  return (
    <>
      <ClusterPicker />
      <ResourceTypePicker />
    </>
  );
};
