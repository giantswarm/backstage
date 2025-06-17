import { Typography } from '@material-ui/core';
import { getClusterLabels } from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { LabelsCard } from '../../../../LabelsCard';
import {
  defaultFriendlyLabelsConfiguration,
  useFriendlyItemsConfiguration,
} from '../../../../hooks';

export function ClusterLabelsCard() {
  const { cluster } = useCurrentCluster();
  const labels = getClusterLabels(cluster);
  const labelsConfig =
    useFriendlyItemsConfiguration('gs.friendlyLabels') ??
    defaultFriendlyLabelsConfiguration;

  if (!labels) {
    return <Typography variant="body2">This cluster has no labels.</Typography>;
  }

  return <LabelsCard labels={labels} labelsConfig={labelsConfig} />;
}
