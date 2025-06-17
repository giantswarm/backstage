import { Typography } from '@material-ui/core';
import { getClusterAnnotations } from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { LabelsCard } from '../../../../LabelsCard';
import { useFriendlyItemsConfiguration } from '../../../../hooks';

export function ClusterAnnotationsCard() {
  const { cluster } = useCurrentCluster();
  const annotations = getClusterAnnotations(cluster);
  const annotationsConfig =
    useFriendlyItemsConfiguration('gs.friendlyAnnotations') ?? [];

  if (!annotations) {
    return (
      <Typography variant="body2">This cluster has no annotations.</Typography>
    );
  }

  return (
    <LabelsCard
      labels={annotations}
      labelsConfig={annotationsConfig}
      labelKind="annotation"
      title="Annotations"
      wrapItems={false}
      friendlyItemsControlLabel="Friendly annotations"
    />
  );
}
