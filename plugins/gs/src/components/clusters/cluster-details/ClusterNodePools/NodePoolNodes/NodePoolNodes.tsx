import { Typography } from '@material-ui/core';
import { useMimirNodePoolNodes } from '../../../../hooks';
import { NodePoolNodesTable } from '../NodePoolNodesTable';

interface NodePoolNodesProps {
  installationName: string;
  clusterName: string;
  nodePoolName: string;
  onClose: () => void;
}

export const NodePoolNodes = ({
  installationName,
  clusterName,
  nodePoolName,
  onClose,
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
        We can't display any details for this node pool, as there are no metrics
        available.
      </Typography>
    );
  }

  return (
    <NodePoolNodesTable
      nodePoolName={nodePoolName}
      nodes={nodes}
      isLoading={isLoading}
      onClose={onClose}
    />
  );
};
