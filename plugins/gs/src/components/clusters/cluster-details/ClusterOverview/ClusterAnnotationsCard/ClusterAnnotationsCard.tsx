import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { LabelsCard } from '../../../../LabelsCard';
import { useFriendlyItemsConfiguration } from '../../../../hooks';

export function ClusterAnnotationsCard() {
  const { cluster } = useCurrentCluster();
  const annotations = cluster.getAnnotations();
  const annotationsConfig =
    useFriendlyItemsConfiguration('gs.friendlyAnnotations') ?? [];

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
