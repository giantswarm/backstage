import { Typography } from '@material-ui/core';
import { getClusterLabels } from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { LabelsCard } from '../../../../LabelsCard';

export function ClusterLabelsCard() {
  const { cluster } = useCurrentCluster();
  const labels = getClusterLabels(cluster);

  if (!labels) {
    return <Typography variant="body2">This cluster has no labels.</Typography>;
  }

  return <LabelsCard labels={labels} />;
}
