import {
  AWSCluster,
  AzureCluster,
  Cluster,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';

export type InfrastructureRef = NonNullable<
  ReturnType<Cluster['getInfrastructureRef']>
>;

type Render = (infrastructureRef: InfrastructureRef) => React.ReactNode;

/**
 * Renders by the kind of the cluster's `spec.infrastructureRef`, and nothing
 * without one. Each render gets the reference, so what it renders never has to
 * look it up again or handle it being missing.
 */
type ClusterSwitchProps = {
  renderAWS: Render;
  renderAzure: Render;
  renderVSphere: Render;
  renderVCD: Render;
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
      return renderAWS(infrastructureRef);
    case kind === AzureCluster.kind:
      return renderAzure(infrastructureRef);
    case kind === VSphereCluster.kind:
      return renderVSphere(infrastructureRef);
    case kind === VCDCluster.kind:
      return renderVCD(infrastructureRef);
    default:
      return null;
  }
};
