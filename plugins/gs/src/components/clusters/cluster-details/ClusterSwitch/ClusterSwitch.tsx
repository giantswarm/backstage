import {
  AWSCluster,
  AzureCluster,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';

type ClusterSwitchProps = {
  renderAWS: () => React.ReactNode;
  renderAzure: () => React.ReactNode;
  renderVSphere: () => React.ReactNode;
  renderVCD: () => React.ReactNode;
};

export const ClusterSwitch = ({
  renderAWS,
  renderAzure,
  renderVSphere,
  renderVCD,
}: ClusterSwitchProps) => {
  const { cluster } = useCurrentCluster();

  const infrastructureRef = cluster.getInfrastructureRef();
  if (!infrastructureRef) {
    return null;
  }

  const { kind } = infrastructureRef;

  switch (true) {
    case kind === AWSCluster.kind:
      return renderAWS();
    case kind === AzureCluster.kind:
      return renderAzure();
    case kind === VSphereCluster.kind:
      return renderVSphere();
    case kind === VCDCluster.kind:
      return renderVCD();
    default:
      return null;
  }
};
