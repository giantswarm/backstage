// eslint-disable-next-line @backstage/no-mixed-plugin-imports
import { DefaultFluxPage } from '@giantswarm/backstage-plugin-flux';
import { CustomFilters } from './CustomFilters';

export const CustomFluxPage = () => {
  return <DefaultFluxPage treeViewFilters={<CustomFilters />} />;
};
