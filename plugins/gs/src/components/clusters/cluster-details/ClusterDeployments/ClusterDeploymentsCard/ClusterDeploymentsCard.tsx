import {
  Deployment,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { getClusterName } from '@giantswarm/backstage-plugin-gs-common';
import { Table, TableColumn } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

type DeploymentData = {
  name: string;
  namespace?: string;
};

const columns: TableColumn<DeploymentData>[] = [
  {
    title: 'Name',
    field: 'name',
    highlight: true,
    defaultSort: 'asc',
  },
  {
    title: 'Namespace',
    field: 'namespace',
  },
];

const DeploymentsTableView = ({
  data,
  isLoading,
}: {
  data: DeploymentData[];
  isLoading: boolean;
}) => {
  return (
    <Table<DeploymentData>
      options={{
        pageSize: 50,
        pageSizeOptions: [50, 100],
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      data={data}
      isLoading={isLoading}
      style={{ width: '100%' }}
      title={<Typography variant="h6">Deployments ({data.length})</Typography>}
      columns={columns}
    />
  );
};

export const ClusterDeploymentsCard = () => {
  const { cluster, installationName } = useCurrentCluster();

  const {
    resources: deployments,
    isLoading,
    errors,
  } = useResources(
    `${installationName}-${getClusterName(cluster)}`,
    Deployment,
  );

  useShowErrors(errors);

  const data = deployments.map(deployment => ({
    name: deployment.getName(),
    namespace: deployment.getNamespace(),
  }));

  return <DeploymentsTableView data={data} isLoading={isLoading} />;
};
