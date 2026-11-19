import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { Toolkit } from '../../../../UI';
import { useClusterToolLinks } from './useClusterToolLinks';

export function ClusterToolsCard() {
  const { cluster, installationName } = useCurrentCluster();
  const { isLoading, links } = useClusterToolLinks(installationName, cluster);

  if (isLoading || links.length === 0) {
    // Show the configured links or the defaults, never one after the other.
    return null;
  }

  return (
    <InfoCard>
      <Toolkit tools={links} />
    </InfoCard>
  );
}
