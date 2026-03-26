import { useEntity } from '@backstage/plugin-catalog-react';
import { Box } from '@material-ui/core';
import {
  getIngressHostFromEntity,
  getGrafanaDashboardFromEntity,
  getSourceLocationFromEntity,
} from '../../utils/entity';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { entityDeploymentsRouteRef } from '../../../routes';
import {
  ErrorsProvider,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InstallationPicker } from './filters/InstallationPicker';
import { QueryClientProvider } from '../../QueryClientProvider';
import {
  EntityChartProvider,
  useCurrentEntityChart,
} from '../../catalog/EntityChartContext';

const DeploymentsContent = () => {
  const { entity } = useEntity();
  const sourceLocation = getSourceLocationFromEntity(entity);
  const grafanaDashboard = getGrafanaDashboardFromEntity(entity);
  const ingressHost = getIngressHostFromEntity(entity);
  const { selectedChart } = useCurrentEntityChart();

  const { clusters } = useClustersInfo();

  return (
    <DeploymentsDataProvider deploymentNames={[selectedChart.name]}>
      <Box mb={clusters.length > 1 ? 2 : undefined}>
        <InstallationPicker />
      </Box>
      <DeploymentsTable
        baseRouteRef={entityDeploymentsRouteRef}
        sourceLocation={sourceLocation}
        grafanaDashboard={grafanaDashboard}
        ingressHost={ingressHost}
        context="catalog-entity"
      />
    </DeploymentsDataProvider>
  );
};

export const EntityDeploymentsContent = () => {
  return (
    <QueryClientProvider>
      <EntityChartProvider>
        <ErrorsProvider>
          <DeploymentsContent />
        </ErrorsProvider>
      </EntityChartProvider>
    </QueryClientProvider>
  );
};
