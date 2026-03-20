import { Table } from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import { useMimirNodePoolNodes } from '../../../../hooks/useMimirNodePoolNodes';
import { getColumns } from './columns';

interface NodePoolNodesProps {
  installationName: string;
  clusterName: string;
  nodePoolName: string;
}

const columns = getColumns();

export const NodePoolNodes = ({
  installationName,
  clusterName,
  nodePoolName,
}: NodePoolNodesProps) => {
  const { nodes, isLoading, error } = useMimirNodePoolNodes({
    installationName,
    clusterName,
    nodePoolName,
  });

  if (error) {
    return (
      <Typography color="error" variant="body2">
        Failed to load node metrics: {error.message}
      </Typography>
    );
  }

  if (!isLoading && nodes.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No node metrics available for this node pool.
      </Typography>
    );
  }

  return (
    <Table
      isLoading={isLoading}
      data={nodes}
      columns={columns}
      options={{
        paging: false,
        search: false,
        toolbar: false,
        padding: 'dense',
      }}
      style={{ width: '100%' }}
    />
  );
};
