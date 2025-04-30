import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import {
  getClusterInfrastructureRef,
  isAWSCluster,
  isAzureCluster,
  isVCDCluster,
  isVSphereCluster,
} from '@giantswarm/backstage-plugin-gs-common';

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

  const { kind, apiVersion } = getClusterInfrastructureRef(cluster);

  switch (true) {
    case isAWSCluster(kind, apiVersion):
      return renderAWS();
    case isAzureCluster(kind, apiVersion):
      return renderAzure();
    case isVSphereCluster(kind, apiVersion):
      return renderVSphere();
    case isVCDCluster(kind, apiVersion):
      return renderVCD();
    default:
      return null;
  }
};
