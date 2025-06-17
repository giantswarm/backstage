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

  return <LabelsCard labels={labels} labelsConfig={labelsConfig} />;
}
