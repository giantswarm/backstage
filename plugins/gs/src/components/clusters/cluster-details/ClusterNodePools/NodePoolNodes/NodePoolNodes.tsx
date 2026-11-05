import { Typography } from '@material-ui/core';
import { MetricsUnavailableAlert } from '@giantswarm/backstage-plugin-ui-react';
import { NodePoolNode } from '../../../../hooks';
import { NodePoolNodesTable } from '../NodePoolNodesTable';

interface NodePoolNodesProps {
  nodes: NodePoolNode[];
  isLoading: boolean;
  error: Error | null;
  provider: 'aws' | 'azure';
}

/**
 * Presentational: the Mimir query is owned by the surrounding details
 * component, so switching tabs cannot tear it down and restart it.
 */
export const NodePoolNodes = ({
  nodes,
  isLoading,
  error,
  provider,
}: NodePoolNodesProps) => {
  if (error) {
    return (
      <MetricsUnavailableAlert
        error={error}
        title="Node metrics could not be loaded."
        description={error.message}
      />
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
      nodes={nodes}
      isLoading={isLoading}
      provider={provider}
    />
  );
};
