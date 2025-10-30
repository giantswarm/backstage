import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { LabelsCard } from '../../../../LabelsCard';
import {
  defaultFriendlyLabelsConfiguration,
  useFriendlyItemsConfiguration,
} from '../../../../hooks';

export function ClusterLabelsCard() {
  const { cluster } = useCurrentCluster();
  const labels = cluster.getLabels();
  const labelsConfig =
    useFriendlyItemsConfiguration('gs.friendlyLabels') ??
    defaultFriendlyLabelsConfiguration;

  return <LabelsCard labels={labels} labelsConfig={labelsConfig} />;
}
